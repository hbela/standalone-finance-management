import type { TinkCredential, TinkProviderConsent } from "./tinkClient.js";
import { classifyTinkCredentialStatus } from "./tinkCredentialState.js";
import { parseConsentExpiry } from "./tinkConsent.js";

export type TinkCredentialRow = {
  credentialsId: string;
  providerName?: string;
  status: "connected" | "reconnect_required" | "temporary_error" | "unknown";
  statusCode?: string;
  consentExpiresAt?: number;
  sessionExtendable?: boolean;
};

export function buildTinkCredentialRows(
  credentials: TinkCredential[],
  consents: TinkProviderConsent[]
): TinkCredentialRow[] {
  const consentByCredentialsId = new Map<string, TinkProviderConsent>();
  for (const consent of consents) {
    if (consent.credentialsId) {
      consentByCredentialsId.set(consent.credentialsId, consent);
    }
  }

  const rows: TinkCredentialRow[] = [];
  for (const credential of credentials) {
    if (!credential.id) {
      continue;
    }

    const state = classifyTinkCredentialStatus(credential);
    const consent = consentByCredentialsId.get(credential.id);

    rows.push({
      credentialsId: credential.id,
      providerName: credential.providerName,
      status: mapStateKindToRowStatus(state.kind),
      statusCode: state.code,
      consentExpiresAt: parseConsentExpiry(consent?.sessionExpiryDate),
      sessionExtendable:
        typeof consent?.sessionExtendable === "boolean" ? consent.sessionExtendable : undefined
    });
  }

  return rows;
}

function mapStateKindToRowStatus(
  kind: ReturnType<typeof classifyTinkCredentialStatus>["kind"]
): TinkCredentialRow["status"] {
  if (kind === "ok") return "connected";
  if (kind === "reconnect_required") return "reconnect_required";
  if (kind === "temporary") return "temporary_error";
  return "unknown";
}
