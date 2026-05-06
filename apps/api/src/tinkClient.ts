import { config } from "./config.js";

export class TinkAuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "TinkAuthError";
    this.status = status;
  }
}

export class TinkRefreshRequiresUserError extends Error {
  status: number;
  errorCode?: string;

  constructor(message: string, status: number, errorCode?: string) {
    super(message);
    this.name = "TinkRefreshRequiresUserError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

export type TinkTokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  user_id?: string;
};

export type TinkAccountIdentifier = {
  scheme?: string;
  type?: string;
  value?: string;
  iban?: string | { iban?: string };
  bban?: string | { bban?: string };
};

export type TinkAccount = {
  id: string;
  name?: string;
  type?: string;
  currencyCode?: string;
  financialInstitutionName?: string;
  holderName?: string;
  holders?: Array<{ name?: string }>;
  identifiers?: TinkAccountIdentifier[];
  credentialsId?: string;
  credentials?: { id?: string };
  balances?: {
    booked?: TinkAmount;
    available?: TinkAmount;
  };
  balance?: TinkAmount;
};

export type TinkTransaction = {
  id: string;
  accountId?: string;
  account?: {
    id?: string;
  };
  amount?: TinkAmount | string | number;
  currencyCode?: string;
  descriptions?: {
    display?: string;
    original?: string;
  };
  description?: string;
  reference?: string;
  merchantInformation?: {
    merchantName?: string;
  };
  merchantName?: string;
  category?: string;
  dates?: {
    booked?: string;
    value?: string;
  };
  bookedDate?: string;
  status?: string;
};

export type TinkCredential = {
  id?: string;
  providerName?: string;
  status?: string;
  statusUpdated?: string;
  statusPayload?: string;
};

export type TinkProviderConsent = {
  credentialsId?: string;
  providerName?: string;
  status?: string;
  statusUpdated?: number | string;
  sessionExpiryDate?: number | string;
  sessionExtendable?: boolean;
};

type TinkClientTokenResponse = {
  access_token: string;
};

type TinkUserResponse = {
  user_id: string;
  external_user_id?: string;
};

type TinkAuthorizationResponse = {
  code: string;
};

type TinkScaledValue = {
  unscaledValue?: string | number;
  scale?: string | number;
};

type TinkAmount = {
  amount?: {
    value?: string | number | TinkScaledValue;
    currencyCode?: string;
  };
  value?: string | number | TinkScaledValue;
  currencyCode?: string;
};

export async function refreshTinkAccessToken(input: { refreshToken: string }) {
  if (!config.tinkClientId || !config.tinkClientSecret) {
    throw new Error("Tink is not configured");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
    client_id: config.tinkClientId,
    client_secret: config.tinkClientSecret
  });

  const response = await fetch(`${config.tinkApiBaseUrl}/api/v1/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 400 || response.status === 401) {
      throw new TinkAuthError(
        getTinkErrorMessage(payload, `Tink refresh failed with ${response.status}`),
        response.status
      );
    }

    throw new Error(getTinkErrorMessage(payload, `Tink refresh failed with ${response.status}`));
  }

  if (!isTinkTokenResponse(payload)) {
    throw new Error("Tink refresh returned an invalid response");
  }

  return payload;
}

export async function exchangeTinkAuthorizationCode(code: string) {
  if (!config.tinkClientId || !config.tinkClientSecret || !config.tinkRedirectUri) {
    throw new Error("Tink is not configured");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.tinkClientId,
    client_secret: config.tinkClientSecret,
    redirect_uri: config.tinkRedirectUri
  });

  const response = await fetch(`${config.tinkApiBaseUrl}/api/v1/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error_description" in payload
        ? String(payload.error_description)
        : `Tink token exchange failed with ${response.status}`;

    throw new Error(message);
  }

  if (!isTinkTokenResponse(payload)) {
    throw new Error("Tink token exchange returned an invalid response");
  }

  return payload;
}

export async function createTinkUser(input: {
  externalUserId: string;
  market: string;
  locale: string;
}) {
  const accessToken = await getTinkClientAccessToken("user:create");
  const response = await fetch(`${config.tinkApiBaseUrl}/api/v1/user/create`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      external_user_id: input.externalUserId,
      market: input.market,
      locale: input.locale
    })
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getTinkErrorMessage(payload, `Tink user creation failed with ${response.status}`));
  }

  if (!isTinkUserResponse(payload)) {
    throw new Error("Tink user creation returned an invalid response");
  }

  return payload;
}

export async function createTinkAuthorization(input: {
  userId: string;
  scopes: string[];
  idHint?: string;
  delegateToClient?: boolean;
}) {
  const accessToken = await getTinkClientAccessToken("authorization:grant");
  const body = new URLSearchParams({
    user_id: input.userId,
    scope: input.scopes.join(",")
  });

  if (input.idHint) {
    body.set("id_hint", input.idHint);
  }

  const path = input.delegateToClient
    ? "/api/v1/oauth/authorization-grant/delegate"
    : "/api/v1/oauth/authorization-grant";

  if (input.delegateToClient) {
    if (!config.tinkClientId) {
      throw new Error("Tink is not configured");
    }

    body.set("actor_client_id", config.tinkClientId);
    body.set("response_type", "code");
  }

  const response = await fetch(`${config.tinkApiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getTinkErrorMessage(payload, `Tink authorization grant failed with ${response.status}`));
  }

  if (!isTinkAuthorizationResponse(payload)) {
    throw new Error("Tink authorization grant returned an invalid response");
  }

  return payload;
}

export async function listTinkAccounts(accessToken: string) {
  const response = await fetch(`${config.tinkApiBaseUrl}/data/v2/accounts`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`
    }
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "errorMessage" in payload
        ? String(payload.errorMessage)
        : `Tink account sync failed with ${response.status}`;

    if (response.status === 401) {
      throw new TinkAuthError(message, response.status);
    }

    throw new Error(message);
  }

  if (!isTinkAccountsResponse(payload)) {
    throw new Error("Tink accounts returned an invalid response");
  }

  return payload.accounts;
}

export async function listTinkTransactions(accessToken: string, params: { from?: string; to?: string }) {
  const url = new URL(`${config.tinkApiBaseUrl}/data/v2/transactions`);

  if (params.from) {
    url.searchParams.set("from", params.from);
  }

  if (params.to) {
    url.searchParams.set("to", params.to);
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`
    }
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "errorMessage" in payload
        ? String(payload.errorMessage)
        : `Tink transaction sync failed with ${response.status}`;

    if (response.status === 401) {
      throw new TinkAuthError(message, response.status);
    }

    throw new Error(message);
  }

  if (!isTinkTransactionsResponse(payload)) {
    throw new Error("Tink transactions returned an invalid response");
  }

  return payload.transactions;
}

export async function listTinkCredentials(accessToken: string) {
  const response = await fetch(`${config.tinkApiBaseUrl}/api/v1/credentials`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`
    }
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "errorMessage" in payload
        ? String(payload.errorMessage)
        : `Tink credentials check failed with ${response.status}`;

    if (response.status === 401) {
      throw new TinkAuthError(message, response.status);
    }

    throw new Error(message);
  }

  if (!isTinkCredentialsResponse(payload)) {
    throw new Error("Tink credentials returned an invalid response");
  }

  return payload.credentials;
}

export async function listTinkProviderConsents(accessToken: string) {
  const response = await fetch(`${config.tinkApiBaseUrl}/api/v1/provider-consents`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`
    }
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "errorMessage" in payload
        ? String(payload.errorMessage)
        : `Tink provider consents request failed with ${response.status}`;

    if (response.status === 401) {
      throw new TinkAuthError(message, response.status);
    }

    throw new Error(message);
  }

  if (!isTinkProviderConsentsResponse(payload)) {
    throw new Error("Tink provider consents returned an invalid response");
  }

  return payload.providerConsents;
}

export async function refreshTinkCredentials(accessToken: string, credentialsId: string) {
  const response = await fetch(
    `${config.tinkApiBaseUrl}/api/v1/credentials/${encodeURIComponent(credentialsId)}/refresh`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (response.status === 204 || response.ok) {
    return;
  }

  const payload = await response.json().catch(() => null);
  const message =
    payload && typeof payload === "object" && "errorMessage" in payload
      ? String(payload.errorMessage)
      : `Tink credentials refresh failed with ${response.status}`;
  const errorCode =
    payload && typeof payload === "object" && "errorCode" in payload
      ? String(payload.errorCode)
      : undefined;

  if (response.status === 401) {
    throw new TinkAuthError(message, response.status);
  }

  if (refreshRequiresUser(response.status, errorCode, message)) {
    throw new TinkRefreshRequiresUserError(message, response.status, errorCode);
  }

  throw new Error(message);
}

export function refreshRequiresUser(status: number, errorCode: string | undefined, message: string) {
  if (status !== 400 && status !== 409) {
    return false;
  }

  const code = errorCode?.toUpperCase() ?? "";
  if (
    code.includes("AUTHENTICATION") ||
    code.includes("SUPPLEMENTAL") ||
    code.includes("UPDATE_CONSENT") ||
    code.includes("SCA")
  ) {
    return true;
  }

  const lowered = message.toLowerCase();
  return (
    lowered.includes("supplemental") ||
    lowered.includes("authenticate") ||
    lowered.includes("re-authorize") ||
    lowered.includes("reauthorize") ||
    lowered.includes("update consent")
  );
}

export function parseTinkAmountValue(value: TinkAmount | string | number | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const raw = value?.amount?.value ?? value?.value;
  return parseScalarOrScaled(raw);
}

function parseScalarOrScaled(raw: string | number | TinkScaledValue | undefined) {
  if (raw === undefined || raw === null) {
    return null;
  }

  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }

  if (typeof raw === "string") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const unscaled =
    typeof raw.unscaledValue === "number" ? raw.unscaledValue : Number(raw.unscaledValue);
  const scale = typeof raw.scale === "number" ? raw.scale : Number(raw.scale);

  if (!Number.isFinite(unscaled) || !Number.isFinite(scale)) {
    return null;
  }

  return unscaled / Math.pow(10, scale);
}

async function getTinkClientAccessToken(scope: string) {
  if (!config.tinkClientId || !config.tinkClientSecret) {
    throw new Error("Tink is not configured");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.tinkClientId,
    client_secret: config.tinkClientSecret,
    scope
  });

  const response = await fetch(`${config.tinkApiBaseUrl}/api/v1/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getTinkErrorMessage(payload, `Tink client token failed with ${response.status}`));
  }

  if (!isTinkClientTokenResponse(payload)) {
    throw new Error("Tink client token returned an invalid response");
  }

  return payload.access_token;
}

function getTinkErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    if ("error_description" in payload) {
      return String(payload.error_description);
    }

    if ("errorMessage" in payload) {
      return String(payload.errorMessage);
    }
  }

  return fallback;
}

function isTinkClientTokenResponse(payload: unknown): payload is TinkClientTokenResponse {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "access_token" in payload &&
    typeof payload.access_token === "string"
  );
}

function isTinkTokenResponse(payload: unknown): payload is TinkTokenResponse {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "access_token" in payload &&
    typeof payload.access_token === "string"
  );
}

function isTinkUserResponse(payload: unknown): payload is TinkUserResponse {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "user_id" in payload &&
    typeof payload.user_id === "string"
  );
}

function isTinkAuthorizationResponse(payload: unknown): payload is TinkAuthorizationResponse {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "code" in payload &&
    typeof payload.code === "string"
  );
}

function isTinkAccountsResponse(payload: unknown): payload is { accounts: TinkAccount[] } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "accounts" in payload &&
    Array.isArray(payload.accounts)
  );
}

function isTinkTransactionsResponse(payload: unknown): payload is { transactions: TinkTransaction[] } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "transactions" in payload &&
    Array.isArray(payload.transactions)
  );
}

function isTinkCredentialsResponse(payload: unknown): payload is { credentials: TinkCredential[] } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "credentials" in payload &&
    Array.isArray(payload.credentials)
  );
}

function isTinkProviderConsentsResponse(
  payload: unknown
): payload is { providerConsents: TinkProviderConsent[] } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "providerConsents" in payload &&
    Array.isArray((payload as { providerConsents: unknown }).providerConsents)
  );
}
