import type { FastifyBaseLogger } from "fastify";

import { config } from "./config.js";
import { convexApi, getConvexClient } from "./convexClient.js";
import { classifyTinkCredentialStatus } from "./tinkCredentialState.js";

export type TinkWebhookEvent = {
  id: string;
  event: string;
  context?: {
    userId?: string;
    externalUserId?: string;
    credentialsId?: string;
  };
  content?: Record<string, unknown>;
};

export type DispatchOutcome = {
  status: "processed" | "ignored" | "failed";
  errorMessage?: string;
};

export async function dispatchTinkWebhookEvent(
  event: TinkWebhookEvent,
  log: FastifyBaseLogger
): Promise<DispatchOutcome> {
  switch (event.event) {
    case "credentials:status-updated":
      return await handleCredentialsStatusUpdated(event, log);
    case "refresh:finished":
    case "account:updated":
    case "account-transactions:modified":
      log.info(
        {
          provider: "tink",
          eventType: event.event,
          eventId: event.id,
          credentialsId: event.context?.credentialsId
        },
        "tink webhook event received (no-op for now)"
      );
      return { status: "ignored" };
    default:
      log.info(
        {
          provider: "tink",
          eventType: event.event,
          eventId: event.id
        },
        "tink webhook event ignored: unrecognized type"
      );
      return { status: "ignored" };
  }
}

async function handleCredentialsStatusUpdated(
  event: TinkWebhookEvent,
  log: FastifyBaseLogger
): Promise<DispatchOutcome> {
  const externalUserId = event.context?.externalUserId;
  const credentialsId = event.context?.credentialsId;
  const status =
    typeof event.content?.status === "string" ? (event.content.status as string) : undefined;

  if (!externalUserId) {
    log.warn(
      { provider: "tink", eventId: event.id },
      "tink credentials:status-updated missing externalUserId"
    );
    return { status: "ignored" };
  }

  const state = classifyTinkCredentialStatus({ status });
  if (state.kind !== "reconnect_required") {
    return { status: "ignored" };
  }

  const convex = getConvexClient();
  if (!convex || !config.apiServiceSecret) {
    return {
      status: "failed",
      errorMessage: "Convex client or API_SERVICE_SECRET not configured"
    };
  }

  const clerkUserId = (await convex
    .query(convexApi.providerConnections.apiGetClerkUserIdByExternalUserId, {
      apiSecret: config.apiServiceSecret,
      provider: "tink",
      externalUserId
    })
    .catch(() => null)) as string | null;

  if (!clerkUserId) {
    log.warn(
      {
        provider: "tink",
        eventId: event.id,
        externalUserId,
        credentialsId
      },
      "tink webhook reconnect mark skipped: no matching connection"
    );
    return { status: "ignored" };
  }

  await convex.mutation(convexApi.providerConnections.apiMarkConnectionReconnectRequired, {
    apiSecret: config.apiServiceSecret,
    clerkUserId,
    provider: "tink",
    errorCode: state.code ?? "RECONNECT_REQUIRED",
    errorMessage: `Tink webhook reported credential status ${state.code ?? "UNKNOWN"}`,
    credentialId: credentialsId
  });

  log.info(
    {
      provider: "tink",
      eventId: event.id,
      externalUserId,
      credentialsId,
      errorCode: state.code
    },
    "tink webhook marked connection reconnect_required"
  );

  return { status: "processed" };
}
