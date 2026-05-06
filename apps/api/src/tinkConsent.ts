import type { TinkProviderConsent } from "./tinkClient.js";

export type PrimaryProviderConsent = {
  credentialsId?: string;
  providerName?: string;
  consentExpiresAt?: number;
};

export function parseConsentExpiry(
  value: TinkProviderConsent["sessionExpiryDate"]
): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

export function pickPrimaryProviderConsent(
  consents: TinkProviderConsent[],
  preferredCredentialsId?: string
): PrimaryProviderConsent | null {
  if (consents.length === 0) {
    return null;
  }

  const matched = preferredCredentialsId
    ? consents.find((consent) => consent.credentialsId === preferredCredentialsId)
    : undefined;
  const consent = matched ?? consents[0];

  return {
    credentialsId: consent.credentialsId,
    providerName: consent.providerName,
    consentExpiresAt: parseConsentExpiry(consent.sessionExpiryDate)
  };
}
