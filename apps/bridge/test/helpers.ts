import type { Env } from "../src/env.js";
import { base64Encode, buildSignedMessage } from "../src/lib/signature.js";

export const testEnv: Env = {
  TINK_CLIENT_ID: "tink-client-id",
  TINK_CLIENT_SECRET: "tink-client-secret",
  TINK_REDIRECT_URI: "https://bridge.example.com/oauth/tink/callback",
  TINK_API_BASE_URL: "https://api.tink.test",
  APP_DEEP_LINK_SCHEME: "standalone-finance",
  SIGNATURE_TIMESTAMP_TOLERANCE_SECONDS: "300",
};

export const universalLinkEnv: Env = {
  ...testEnv,
  APP_UNIVERSAL_LINK_HOST: "finance.appointer.hu",
  IOS_APP_BUNDLE_ID: "com.elyscom.standalonefinancemanagement",
  IOS_TEAM_ID: "ABCDE12345",
  ANDROID_PACKAGE_NAME: "com.elyscom.standalonefinancemanagement",
  ANDROID_SHA256_FINGERPRINTS: "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99",
};

export function tokenResponse(overrides: Record<string, unknown> = {}) {
  return {
    access_token: "tink-access",
    refresh_token: "tink-refresh",
    expires_in: 7200,
    token_type: "bearer",
    scope: "accounts:read",
    ...overrides,
  };
}

export async function signAsDevice(input: {
  method: string;
  path: string;
  body: string;
  timestamp?: number;
}) {
  const { publicKey, privateKey } = (await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"]
  )) as CryptoKeyPair;
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000);
  const message = await buildSignedMessage(
    String(timestamp),
    input.method,
    input.path,
    input.body
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("Ed25519", privateKey, message as BufferSource)
  );
  const publicKeyRaw = new Uint8Array(await crypto.subtle.exportKey("raw", publicKey));
  return {
    "X-Public-Key": base64Encode(publicKeyRaw),
    "X-Timestamp": String(timestamp),
    "X-Signature": base64Encode(signature),
  };
}
