import type { TinkCredential } from "./tinkClient.js";

export type TinkCredentialStateKind =
  | "ok"
  | "reconnect_required"
  | "temporary"
  | "unknown";

export type TinkCredentialState = {
  kind: TinkCredentialStateKind;
  code?: string;
};

const RECONNECT_STATUSES = new Set([
  "AUTHENTICATION_ERROR",
  "SESSION_EXPIRED",
  "DELETED"
]);

const TEMPORARY_STATUSES = new Set(["TEMPORARY_ERROR", "DISABLED"]);

const HEALTHY_STATUSES = new Set([
  "UPDATED",
  "UPDATING",
  "CREATED",
  "AUTHENTICATING",
  "AWAITING_MOBILE_BANKID_AUTHENTICATION",
  "AWAITING_SUPPLEMENTAL_INFORMATION",
  "AWAITING_THIRD_PARTY_APP_AUTHENTICATION"
]);

export function classifyTinkCredentialStatus(
  credential: Pick<TinkCredential, "status">
): TinkCredentialState {
  const status = credential.status?.toUpperCase();

  if (!status) {
    return { kind: "unknown" };
  }

  if (RECONNECT_STATUSES.has(status)) {
    return { kind: "reconnect_required", code: status };
  }

  if (TEMPORARY_STATUSES.has(status)) {
    return { kind: "temporary", code: status };
  }

  if (HEALTHY_STATUSES.has(status)) {
    return { kind: "ok", code: status };
  }

  return { kind: "unknown", code: status };
}

export type AggregatedCredentialState = {
  kind: TinkCredentialStateKind;
  code?: string;
  credentialId?: string;
};

export function aggregateCredentialStates(
  credentials: Array<Pick<TinkCredential, "id" | "status">>
): AggregatedCredentialState {
  if (credentials.length === 0) {
    return { kind: "reconnect_required", code: "NO_CREDENTIALS" };
  }

  let firstTemporary: AggregatedCredentialState | undefined;
  let firstUnknown: AggregatedCredentialState | undefined;

  for (const credential of credentials) {
    const state = classifyTinkCredentialStatus(credential);

    if (state.kind === "reconnect_required") {
      return {
        kind: "reconnect_required",
        code: state.code,
        credentialId: credential.id
      };
    }

    if (state.kind === "temporary" && !firstTemporary) {
      firstTemporary = {
        kind: "temporary",
        code: state.code,
        credentialId: credential.id
      };
    }

    if (state.kind === "unknown" && !firstUnknown) {
      firstUnknown = {
        kind: "unknown",
        code: state.code,
        credentialId: credential.id
      };
    }
  }

  return firstTemporary ?? firstUnknown ?? { kind: "ok" };
}
