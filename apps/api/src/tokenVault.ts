import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { config } from "./config.js";

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

type StoredTokenSet = {
  version: 1;
  algorithm: "aes-256-gcm";
  iv: string;
  authTag: string;
  ciphertext: string;
};

export async function storeProviderTokens(tokens: ProviderTokenSet) {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(tokens), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const tokenRef = `${tokens.provider}_${randomUUID()}`;
  const payload: StoredTokenSet = {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64url"),
    authTag: authTag.toString("base64url"),
    ciphertext: ciphertext.toString("base64url")
  };

  await mkdir(config.tokenVaultDir, { recursive: true });
  await writeFile(tokenPath(tokenRef), JSON.stringify(payload), { encoding: "utf8", mode: 0o600 });

  return tokenRef;
}

export async function readProviderTokens(tokenRef: string) {
  const key = getEncryptionKey();
  const raw = await readFile(tokenPath(tokenRef), "utf8");
  const payload = JSON.parse(raw) as StoredTokenSet;
  const decipher = createDecipheriv(
    payload.algorithm,
    key,
    Buffer.from(payload.iv, "base64url")
  );

  decipher.setAuthTag(Buffer.from(payload.authTag, "base64url"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64url")),
    decipher.final()
  ]);

  return JSON.parse(plaintext.toString("utf8")) as ProviderTokenSet;
}

export async function deleteProviderTokens(tokenRef: string) {
  await unlink(tokenPath(tokenRef)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") {
      throw error;
    }
  });
}

function tokenPath(tokenRef: string) {
  if (!/^(tink|wise)_[0-9a-f-]+$/i.test(tokenRef)) {
    throw new Error("Invalid token reference");
  }

  return path.join(config.tokenVaultDir, `${tokenRef}.json`);
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
