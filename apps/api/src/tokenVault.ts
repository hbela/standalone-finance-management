import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";

import { config } from "./config.js";
import { convexApi, getConvexClient } from "./convexClient.js";

export type ProviderTokenSet = {
  provider: "tink" | "wise";
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresAt?: number;
  externalUserId?: string;
  externalCredentialId?: string;
  receivedAt: number;
};

type EncryptedBlob = {
  ciphertext: string;
  iv: string;
  authTag: string;
  algorithm: "aes-256-gcm";
  version: number;
};

const CURRENT_VERSION = 1;

export async function storeProviderTokens(
  tokens: ProviderTokenSet,
  context: { clerkUserId: string }
) {
  const blob = encryptTokens(tokens);
  const tokenRef = `${tokens.provider}_${randomUUID()}`;
  const convex = requireConvex();
  const apiSecret = requireApiSecret();

  await convex.mutation(convexApi.providerTokens.apiPutProviderToken, {
    apiSecret,
    tokenRef,
    clerkUserId: context.clerkUserId,
    provider: tokens.provider,
    ciphertext: blob.ciphertext,
    iv: blob.iv,
    authTag: blob.authTag,
    algorithm: blob.algorithm,
    version: blob.version
  });

  return tokenRef;
}

export async function readProviderTokens(tokenRef: string) {
  validateTokenRef(tokenRef);
  const convex = requireConvex();
  const apiSecret = requireApiSecret();

  const row = (await convex.query(convexApi.providerTokens.apiGetProviderToken, {
    apiSecret,
    tokenRef
  })) as
    | (EncryptedBlob & { tokenRef: string; provider: "tink" | "wise" })
    | null;

  if (!row) {
    throw new Error("Token not found");
  }

  return decryptTokens(row);
}

export async function updateProviderTokens(tokenRef: string, tokens: ProviderTokenSet) {
  validateTokenRef(tokenRef);
  const blob = encryptTokens(tokens);
  const convex = requireConvex();
  const apiSecret = requireApiSecret();

  await convex.mutation(convexApi.providerTokens.apiUpdateProviderToken, {
    apiSecret,
    tokenRef,
    ciphertext: blob.ciphertext,
    iv: blob.iv,
    authTag: blob.authTag,
    algorithm: blob.algorithm,
    version: blob.version
  });
}

export async function deleteProviderTokens(tokenRef: string) {
  validateTokenRef(tokenRef);
  const convex = requireConvex();
  const apiSecret = requireApiSecret();

  await convex.mutation(convexApi.providerTokens.apiDeleteProviderToken, {
    apiSecret,
    tokenRef
  });
}

function encryptTokens(tokens: ProviderTokenSet): EncryptedBlob {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(tokens), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    authTag: authTag.toString("base64url"),
    algorithm: "aes-256-gcm",
    version: CURRENT_VERSION
  };
}

function decryptTokens(blob: EncryptedBlob): ProviderTokenSet {
  const key = getEncryptionKey();
  const decipher = createDecipheriv(
    blob.algorithm,
    key,
    Buffer.from(blob.iv, "base64url")
  );

  decipher.setAuthTag(Buffer.from(blob.authTag, "base64url"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, "base64url")),
    decipher.final()
  ]);

  return JSON.parse(plaintext.toString("utf8")) as ProviderTokenSet;
}

function validateTokenRef(tokenRef: string) {
  if (!/^(tink|wise)_[0-9a-f-]+$/i.test(tokenRef)) {
    throw new Error("Invalid token reference");
  }
}

function getEncryptionKey() {
  if (!config.tokenEncryptionKey) {
    throw new Error("Token encryption key is not configured");
  }

  const key =
    config.tokenEncryptionKey.length === 64
      ? Buffer.from(config.tokenEncryptionKey, "hex")
      : Buffer.from(config.tokenEncryptionKey, "base64");

  if (key.length !== 32) {
    throw new Error("Token encryption key must decode to 32 bytes");
  }

  return key;
}

function requireConvex() {
  const convex = getConvexClient();
  if (!convex) {
    throw new Error("Convex client is not configured");
  }

  return convex;
}

function requireApiSecret() {
  if (!config.apiServiceSecret) {
    throw new Error("API service secret is not configured");
  }

  return config.apiServiceSecret;
}
