import { config } from "./config.js";

export type TinkTokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  user_id?: string;
};

export type TinkAccount = {
  id: string;
  name?: string;
  type?: string;
  currencyCode?: string;
  financialInstitutionName?: string;
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

type TinkAmount = {
  amount?: {
    value?: string | number;
    currencyCode?: string;
  };
  value?: string | number;
  currencyCode?: string;
};

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

    throw new Error(message);
  }

  if (!isTinkTransactionsResponse(payload)) {
    throw new Error("Tink transactions returned an invalid response");
  }

  return payload.transactions;
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
  const parsed = typeof raw === "number" ? raw : Number(raw);

  return Number.isFinite(parsed) ? parsed : null;
}

function isTinkTokenResponse(payload: unknown): payload is TinkTokenResponse {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "access_token" in payload &&
    typeof payload.access_token === "string"
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
