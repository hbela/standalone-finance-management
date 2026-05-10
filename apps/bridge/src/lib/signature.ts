const TOLERANCE_DEFAULT_SECONDS = 300;

export class SignatureError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "SignatureError";
    this.status = status;
  }
}

export type SignatureHeaders = {
  publicKey: string;
  timestamp: string;
  signature: string;
};

export function readSignatureHeaders(headers: Headers): SignatureHeaders {
  const publicKey = headers.get("x-public-key");
  const timestamp = headers.get("x-timestamp");
  const signature = headers.get("x-signature");
  if (!publicKey || !timestamp || !signature) {
    throw new SignatureError("Missing X-Public-Key, X-Timestamp, or X-Signature header");
  }
  return { publicKey, timestamp, signature };
}

export type VerifySignedRequestInput = {
  method: string;
  path: string;
  body: string;
  headers: SignatureHeaders;
  toleranceSeconds?: number;
  now?: number;
};

export async function verifySignedRequest(
  input: VerifySignedRequestInput
): Promise<{ publicKey: Uint8Array }> {
  const tolerance = input.toleranceSeconds ?? TOLERANCE_DEFAULT_SECONDS;
  const now = input.now ?? Math.floor(Date.now() / 1000);

  const timestamp = Number(input.headers.timestamp);
  if (!Number.isFinite(timestamp)) {
    throw new SignatureError("Invalid X-Timestamp header");
  }
  if (Math.abs(now - timestamp) > tolerance) {
    throw new SignatureError("Signature timestamp out of tolerance window");
  }

  const publicKey = base64Decode(input.headers.publicKey);
  if (publicKey.length !== 32) {
    throw new SignatureError("Invalid Ed25519 public key length");
  }

  const signature = base64Decode(input.headers.signature);
  if (signature.length !== 64) {
    throw new SignatureError("Invalid Ed25519 signature length");
  }

  const message = await buildSignedMessage(input.headers.timestamp, input.method, input.path, input.body);

  const key = await crypto.subtle.importKey(
    "raw",
    publicKey as BufferSource,
    { name: "Ed25519" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    "Ed25519",
    key,
    signature as BufferSource,
    message as BufferSource
  );
  if (!valid) {
    throw new SignatureError("Signature verification failed");
  }
  return { publicKey };
}

export async function buildSignedMessage(
  timestamp: string,
  method: string,
  path: string,
  body: string
): Promise<Uint8Array> {
  const bodyHash = await sha256Hex(body);
  return new TextEncoder().encode(
    `${timestamp}\n${method.toUpperCase()}\n${path}\n${bodyHash}`
  );
}

export function base64Decode(input: string): Uint8Array {
  // Accept both standard base64 and base64url
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
