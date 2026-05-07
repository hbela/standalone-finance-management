import { config } from "./config.js";

export class WiseAuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "WiseAuthError";
    this.status = status;
  }
}

export type WiseProfileType = "PERSONAL" | "BUSINESS";

export type WiseProfile = {
  id: number;
  type: WiseProfileType;
  fullName?: string;
  details?: {
    firstName?: string;
    lastName?: string;
    name?: string;
    businessName?: string;
  };
};

export type WiseBalanceAmount = {
  value: number;
  currency: string;
};

export type WiseBalance = {
  id: number;
  currency: string;
  amount: WiseBalanceAmount;
  reservedAmount?: WiseBalanceAmount;
  cashAmount?: WiseBalanceAmount;
  totalWorth?: WiseBalanceAmount;
  type?: string;
  name?: string;
};

export type WiseStatementTransaction = {
  date?: string;
  type?: "DEBIT" | "CREDIT";
  amount?: WiseBalanceAmount;
  totalFees?: WiseBalanceAmount;
  runningBalance?: WiseBalanceAmount;
  details?: {
    type?: string;
    description?: string;
    paymentReference?: string;
    sourceCurrency?: string;
    targetCurrency?: string;
    sourceAmount?: WiseBalanceAmount;
    targetAmount?: WiseBalanceAmount;
    senderName?: string;
    senderAccount?: string;
    recipientName?: string;
  };
  exchangeDetails?: {
    fromAmount?: WiseBalanceAmount;
    toAmount?: WiseBalanceAmount;
    rate?: number;
  };
  referenceNumber?: string;
};

export type WiseStatementResponse = {
  accountHolder?: { type?: string; address?: unknown };
  issuer?: { name?: string };
  request?: { profileId?: number; balanceId?: number; currency?: string };
  transactions: WiseStatementTransaction[];
  endOfStatementBalance?: WiseBalanceAmount;
};

function authHeaders(accessToken: string) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`
  };
}

async function readError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  if (payload && typeof payload === "object") {
    if ("error_description" in payload) {
      return String(payload.error_description);
    }
    if ("errors" in payload && Array.isArray(payload.errors) && payload.errors[0]?.message) {
      return String(payload.errors[0].message);
    }
    if ("message" in payload) {
      return String(payload.message);
    }
  }
  return fallback;
}

export async function listWiseProfiles(accessToken: string): Promise<WiseProfile[]> {
  const response = await fetch(`${config.wiseApiBaseUrl}/v2/profiles`, {
    method: "GET",
    headers: authHeaders(accessToken)
  });

  if (!response.ok) {
    const message = await readError(response, `Wise profiles request failed with ${response.status}`);
    if (response.status === 401 || response.status === 403) {
      throw new WiseAuthError(message, response.status);
    }
    throw new Error(message);
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error("Wise profiles returned an invalid response");
  }
  return payload as WiseProfile[];
}

export async function listWiseBalances(
  accessToken: string,
  profileId: number,
  options: { types?: string[] } = {}
): Promise<WiseBalance[]> {
  const url = new URL(`${config.wiseApiBaseUrl}/v4/profiles/${profileId}/balances`);
  url.searchParams.set("types", (options.types ?? ["STANDARD", "SAVINGS"]).join(","));

  const response = await fetch(url, { method: "GET", headers: authHeaders(accessToken) });
  if (!response.ok) {
    const message = await readError(response, `Wise balances request failed with ${response.status}`);
    if (response.status === 401 || response.status === 403) {
      throw new WiseAuthError(message, response.status);
    }
    throw new Error(message);
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error("Wise balances returned an invalid response");
  }
  return payload as WiseBalance[];
}

export async function listWiseStatement(
  accessToken: string,
  input: {
    profileId: number;
    balanceId: number;
    currency: string;
    intervalStart: string;
    intervalEnd: string;
  }
): Promise<WiseStatementResponse> {
  const url = new URL(
    `${config.wiseApiBaseUrl}/v1/profiles/${input.profileId}/balance-statements/${input.balanceId}/statement.json`
  );
  url.searchParams.set("currency", input.currency);
  url.searchParams.set("intervalStart", input.intervalStart);
  url.searchParams.set("intervalEnd", input.intervalEnd);
  url.searchParams.set("type", "COMPACT");

  const response = await fetch(url, { method: "GET", headers: authHeaders(accessToken) });
  if (!response.ok) {
    const message = await readError(
      response,
      `Wise statement request failed with ${response.status}`
    );
    if (response.status === 401 || response.status === 403) {
      throw new WiseAuthError(message, response.status);
    }
    throw new Error(message);
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as WiseStatementResponse).transactions)) {
    throw new Error("Wise statement returned an invalid response");
  }
  return payload as WiseStatementResponse;
}
