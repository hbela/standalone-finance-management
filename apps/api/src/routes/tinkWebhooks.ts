import { createHash } from "node:crypto";

import type { FastifyInstance } from "fastify";

import { config } from "../config.js";
import { convexApi, getConvexClient } from "../convexClient.js";
import { dispatchTinkWebhookEvent, type TinkWebhookEvent } from "../tinkWebhookHandlers.js";
import { verifyTinkSignature } from "../tinkWebhookSignature.js";

const TINK_SIGNATURE_HEADER = "x-tink-signature";

export async function registerTinkWebhookRoutes(app: FastifyInstance) {
  await app.register(async (instance) => {
    instance.addContentTypeParser(
      "application/json",
      { parseAs: "string" },
      (_request, body, done) => {
        try {
          const raw = typeof body === "string" ? body : body.toString("utf8");
          const parsed = raw.length > 0 ? JSON.parse(raw) : {};
          done(null, { raw, parsed });
        } catch (error) {
          done(error instanceof Error ? error : new Error("Invalid JSON"), undefined);
        }
      }
    );

    instance.post(config.tinkWebhookPath, async (request, reply) => {
      if (!config.tinkWebhookSecret || !config.apiServiceSecret) {
        request.log.warn(
          {
            provider: "tink",
            hasSecret: Boolean(config.tinkWebhookSecret),
            hasApiSecret: Boolean(config.apiServiceSecret)
          },
          "tink webhook rejected: not configured"
        );
        return reply.code(401).send({ error: "not_configured" });
      }

      const body = request.body as { raw?: string; parsed?: unknown } | undefined;
      const rawBody = body?.raw ?? "";
      const headerValue = request.headers[TINK_SIGNATURE_HEADER];
      const header = Array.isArray(headerValue) ? headerValue[0] : headerValue;

      const verification = verifyTinkSignature({
        header,
        rawBody,
        secret: config.tinkWebhookSecret,
        toleranceSeconds: config.tinkWebhookToleranceSeconds
      });

      if (!verification.valid) {
        request.log.warn(
          { provider: "tink", reason: verification.reason },
          "tink webhook signature rejected"
        );
        return reply.code(401).send({ error: "invalid_signature", reason: verification.reason });
      }

      const event = parseTinkEvent(body?.parsed);
      if (!event) {
        request.log.warn({ provider: "tink" }, "tink webhook payload missing required fields");
        return reply.code(400).send({ error: "invalid_payload" });
      }

      const convex = getConvexClient();
      if (!convex) {
        return reply.code(500).send({ error: "convex_unavailable" });
      }

      const payloadDigest = createHash("sha256").update(rawBody).digest("hex");

      let recordResult: { duplicate: boolean } | undefined;
      try {
        recordResult = (await convex.mutation(
          convexApi.providerWebhookEvents.apiRecordProviderWebhookEvent,
          {
            apiSecret: config.apiServiceSecret,
            provider: "tink",
            eventId: event.id,
            eventType: event.event,
            payloadDigest,
            externalUserId: event.context?.externalUserId,
            credentialsId: event.context?.credentialsId
          }
        )) as { duplicate: boolean };
      } catch (error) {
        request.log.error(
          {
            provider: "tink",
            eventId: event.id,
            errorMessage: error instanceof Error ? error.message : "record failed"
          },
          "tink webhook record failed"
        );
        return reply.code(502).send({ error: "record_failed" });
      }

      if (recordResult.duplicate) {
        request.log.info(
          { provider: "tink", eventId: event.id, eventType: event.event },
          "tink webhook duplicate ignored"
        );
        return reply.code(200).send({ status: "duplicate" });
      }

      await reply.code(200).send({ status: "received" });

      setImmediate(() => {
        void processTinkWebhookEvent(event, request.log);
      });

      return reply;
    });
  });
}

async function processTinkWebhookEvent(
  event: TinkWebhookEvent,
  log: Parameters<typeof dispatchTinkWebhookEvent>[1]
) {
  const convex = getConvexClient();
  if (!convex || !config.apiServiceSecret) {
    return;
  }

  let outcome;
  try {
    outcome = await dispatchTinkWebhookEvent(event, log);
  } catch (error) {
    outcome = {
      status: "failed" as const,
      errorMessage: error instanceof Error ? error.message : "dispatch threw"
    };
  }

  await convex
    .mutation(convexApi.providerWebhookEvents.apiMarkProviderWebhookEventProcessed, {
      apiSecret: config.apiServiceSecret,
      eventId: event.id,
      status: outcome.status,
      errorMessage: outcome.errorMessage
    })
    .catch((error) => {
      log.error(
        {
          provider: "tink",
          eventId: event.id,
          errorMessage: error instanceof Error ? error.message : "mark processed failed"
        },
        "tink webhook mark processed failed"
      );
    });
}

function parseTinkEvent(input: unknown): TinkWebhookEvent | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  const id = typeof candidate.id === "string" ? candidate.id : undefined;
  const event = typeof candidate.event === "string" ? candidate.event : undefined;
  if (!id || !event) {
    return null;
  }

  const contextRaw =
    candidate.context && typeof candidate.context === "object"
      ? (candidate.context as Record<string, unknown>)
      : undefined;

  const context = contextRaw
    ? {
        userId: typeof contextRaw.userId === "string" ? contextRaw.userId : undefined,
        externalUserId:
          typeof contextRaw.externalUserId === "string" ? contextRaw.externalUserId : undefined,
        credentialsId:
          typeof contextRaw.credentialsId === "string" ? contextRaw.credentialsId : undefined
      }
    : undefined;

  const content =
    candidate.content && typeof candidate.content === "object"
      ? (candidate.content as Record<string, unknown>)
      : undefined;

  return { id, event, context, content };
}
