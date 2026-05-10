import { describe, expect, it } from "vitest";
import {
  base64Decode,
  base64Encode,
  buildSignedMessage,
  readSignatureHeaders,
  SignatureError,
  verifySignedRequest,
} from "../src/lib/signature.js";

async function generateEd25519KeyPair() {
  return crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as Promise<CryptoKeyPair>;
}

async function exportRawPublicKey(key: CryptoKey) {
  const raw = await crypto.subtle.exportKey("raw", key);
  return new Uint8Array(raw);
}

async function signMessage(privateKey: CryptoKey, message: Uint8Array) {
  const sig = await crypto.subtle.sign("Ed25519", privateKey, message as BufferSource);
  return new Uint8Array(sig);
}

async function makeSignedHeaders(input: {
  method: string;
  path: string;
  body: string;
  timestamp: number;
}) {
  const { publicKey, privateKey } = await generateEd25519KeyPair();
  const pubRaw = await exportRawPublicKey(publicKey);
  const message = await buildSignedMessage(
    String(input.timestamp),
    input.method,
    input.path,
    input.body
  );
  const sig = await signMessage(privateKey, message);
  return {
    headers: {
      publicKey: base64Encode(pubRaw),
      timestamp: String(input.timestamp),
      signature: base64Encode(sig),
    },
    pubRaw,
  };
}

describe("signature.verifySignedRequest", () => {
  it("verifies a freshly signed request round-trip", async () => {
    const now = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({ refresh_token: "abc" });
    const { headers, pubRaw } = await makeSignedHeaders({
      method: "POST",
      path: "/oauth/tink/refresh",
      body,
      timestamp: now,
    });

    const result = await verifySignedRequest({
      method: "POST",
      path: "/oauth/tink/refresh",
      body,
      headers,
      now,
    });

    expect(result.publicKey).toEqual(pubRaw);
  });

  it("rejects when the timestamp is outside tolerance", async () => {
    const now = Math.floor(Date.now() / 1000);
    const stale = now - 600;
    const body = "{}";
    const { headers } = await makeSignedHeaders({
      method: "POST",
      path: "/oauth/tink/refresh",
      body,
      timestamp: stale,
    });

    await expect(
      verifySignedRequest({
        method: "POST",
        path: "/oauth/tink/refresh",
        body,
        headers,
        toleranceSeconds: 300,
        now,
      })
    ).rejects.toBeInstanceOf(SignatureError);
  });

  it("rejects when the body is tampered", async () => {
    const now = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({ refresh_token: "abc" });
    const { headers } = await makeSignedHeaders({
      method: "POST",
      path: "/oauth/tink/refresh",
      body,
      timestamp: now,
    });

    await expect(
      verifySignedRequest({
        method: "POST",
        path: "/oauth/tink/refresh",
        body: JSON.stringify({ refresh_token: "tampered" }),
        headers,
        now,
      })
    ).rejects.toThrow(/Signature verification failed/);
  });

  it("rejects when the path is changed", async () => {
    const now = Math.floor(Date.now() / 1000);
    const body = "{}";
    const { headers } = await makeSignedHeaders({
      method: "POST",
      path: "/oauth/tink/refresh",
      body,
      timestamp: now,
    });

    await expect(
      verifySignedRequest({
        method: "POST",
        path: "/oauth/wise/refresh",
        body,
        headers,
        now,
      })
    ).rejects.toThrow(/Signature verification failed/);
  });

  it("rejects an invalid public key length", async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(
      verifySignedRequest({
        method: "POST",
        path: "/oauth/tink/refresh",
        body: "{}",
        headers: {
          publicKey: base64Encode(new Uint8Array(16)),
          timestamp: String(now),
          signature: base64Encode(new Uint8Array(64)),
        },
        now,
      })
    ).rejects.toThrow(/Invalid Ed25519 public key length/);
  });
});

describe("signature.readSignatureHeaders", () => {
  it("extracts signature headers when all are present", () => {
    const headers = new Headers({
      "x-public-key": "pub",
      "x-timestamp": "12345",
      "x-signature": "sig",
    });
    expect(readSignatureHeaders(headers)).toEqual({
      publicKey: "pub",
      timestamp: "12345",
      signature: "sig",
    });
  });

  it("throws when any header is missing", () => {
    const headers = new Headers({ "x-public-key": "pub", "x-timestamp": "1" });
    expect(() => readSignatureHeaders(headers)).toThrow(SignatureError);
  });
});

describe("signature.base64", () => {
  it("round-trips arbitrary bytes via base64Encode + base64Decode", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const encoded = base64Encode(bytes);
    expect(base64Decode(encoded)).toEqual(bytes);
  });

  it("accepts base64url (- and _) input", () => {
    const bytes = new Uint8Array([255, 254, 253]);
    const standard = base64Encode(bytes);
    const urlSafe = standard.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(base64Decode(urlSafe)).toEqual(bytes);
  });
});
