import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const stateTtlMs = 10 * 60 * 1000;

type TinkStatePayload = {
  provider: "tink";
  nonce: string;
  issuedAt: number;
  tinkUserId?: string;
  clerkUserId?: string;
};

type WiseStatePayload = {
  provider: "wise";
  nonce: string;
  issuedAt: number;
  clerkUserId?: string;
};

export function createTinkState(
  secret: string,
  input?: { tinkUserId?: string; clerkUserId?: string }
) {
  const payload: TinkStatePayload = {
    provider: "tink",
    nonce: randomUUID(),
    issuedAt: Date.now(),
    tinkUserId: input?.tinkUserId,
    clerkUserId: input?.clerkUserId
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export function verifyTinkState(state: string, secret: string) {
  const [encodedPayload, signature] = state.split(".");

  if (!encodedPayload || !signature) {
    throw new Error("Invalid OAuth state");
  }

  const expectedSignature = sign(encodedPayload, secret);
  if (!constantTimeEquals(signature, expectedSignature)) {
    throw new Error("Invalid OAuth state signature");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as TinkStatePayload;
  if (payload.provider !== "tink" || !payload.nonce) {
    throw new Error("Invalid OAuth state payload");
  }

  if (Date.now() - payload.issuedAt > stateTtlMs) {
    throw new Error("Expired OAuth state");
  }

  return payload;
}

export function createWiseState(secret: string, input?: { clerkUserId?: string }) {
  const payload: WiseStatePayload = {
    provider: "wise",
    nonce: randomUUID(),
    issuedAt: Date.now(),
    clerkUserId: input?.clerkUserId
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyWiseState(state: string, secret: string) {
  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Invalid OAuth state");
  }

  const expectedSignature = sign(encodedPayload, secret);
  if (!constantTimeEquals(signature, expectedSignature)) {
    throw new Error("Invalid OAuth state signature");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as WiseStatePayload;
  if (payload.provider !== "wise" || !payload.nonce) {
    throw new Error("Invalid OAuth state payload");
  }

  if (Date.now() - payload.issuedAt > stateTtlMs) {
    throw new Error("Expired OAuth state");
  }

  return payload;
}

export function hashOAuthState(state: string) {
  return createHash("sha256").update(state).digest("base64url");
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function constantTimeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
