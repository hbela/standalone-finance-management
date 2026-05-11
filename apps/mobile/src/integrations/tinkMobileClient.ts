export type TinkScaledValue = {
  unscaledValue?: string | number;
  scale?: string | number;
};

export type TinkAmount = {
  amount?: {
    value?: string | number | TinkScaledValue;
    currencyCode?: string;
  };
  value?: string | number | TinkScaledValue;
  currencyCode?: string;
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
  account?: { id?: string };
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

const tinkApiBaseUrl = "https://api.tink.com";

export async function listTinkAccounts(accessToken: string) {
  const payload = await tinkGet<{ accounts: TinkAccount[] }>(accessToken, "/data/v2/accounts");
  if (!Array.isArray(payload.accounts)) {
    throw new Error("Tink accounts returned an invalid response.");
  }
  return payload.accounts;
}

export async function listTinkTransactions(
  accessToken: string,
  params: { from?: string; to?: string } = {}
) {
  const url = new URL(`${tinkApiBaseUrl}/data/v2/transactions`);
  if (params.from) {
    url.searchParams.set("from", params.from);
  }
  if (params.to) {
    url.searchParams.set("to", params.to);
  }

  const payload = await tinkGet<{ transactions: TinkTransaction[] }>(accessToken, url);
  if (!Array.isArray(payload.transactions)) {
    throw new Error("Tink transactions returned an invalid response.");
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
  return parseScalarOrScaled(raw);
}

async function tinkGet<T>(accessToken: string, pathOrUrl: string | URL): Promise<T> {
  const url =
    pathOrUrl instanceof URL
      ? pathOrUrl.toString()
      : `${tinkApiBaseUrl}${pathOrUrl}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`
    }
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getTinkErrorMessage(payload, `Tink request failed with ${response.status}.`));
  }

  return payload as T;
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

function getTinkErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    if ("error_description" in payload) {
      return String(payload.error_description);
    }
    if ("errorMessage" in payload) {
      return String(payload.errorMessage);
    }
    if ("message" in payload) {
      return String(payload.message);
    }
  }

  return fallback;
}
