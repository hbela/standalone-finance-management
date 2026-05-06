import { createHmac, timingSafeEqual } from "node:crypto";

export type SignatureVerificationResult =
  | { valid: true; timestamp: number }
  | { valid: false; reason: string };

export function verifyTinkSignature(input: {
  header: string | undefined;
  rawBody: string;
  secret: string;
  toleranceSeconds: number;
  now?: () => number;
}): SignatureVerificationResult {
  if (!input.header) {
    return { valid: false, reason: "missing_header" };
  }

  const parsed = parseSignatureHeader(input.header);
  if (!parsed) {
    return { valid: false, reason: "malformed_header" };
  }

  const nowSeconds = Math.floor((input.now?.() ?? Date.now()) / 1000);
  const skew = Math.abs(nowSeconds - parsed.timestamp);
  if (skew > Math.max(0, input.toleranceSeconds)) {
    return { valid: false, reason: "timestamp_out_of_tolerance" };
  }

  const expected = createHmac("sha256", input.secret)
    .update(`${parsed.timestamp}.${input.rawBody}`)
    .digest("hex");

  const expectedBytes = Buffer.from(expected, "hex");
  const providedBytes = Buffer.from(parsed.signature, "hex");

  if (expectedBytes.length === 0 || expectedBytes.length !== providedBytes.length) {
    return { valid: false, reason: "signature_mismatch" };
  }

  if (!timingSafeEqual(expectedBytes, providedBytes)) {
    return { valid: false, reason: "signature_mismatch" };
  }

  return { valid: true, timestamp: parsed.timestamp };
}

function parseSignatureHeader(header: string): { timestamp: number; signature: string } | null {
  let timestamp: number | undefined;
  let signature: string | undefined;

  for (const segment of header.split(",")) {
    const [rawKey, rawValue] = segment.split("=", 2);
    const key = rawKey?.trim();
    const value = rawValue?.trim();
    if (!key || !value) {
      continue;
    }

    if (key === "t") {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 0) {
        timestamp = Math.floor(numeric);
      }
    }

    if (key === "v1" && /^[0-9a-f]+$/i.test(value)) {
      signature = value.toLowerCase();
    }
  }

  if (timestamp === undefined || signature === undefined) {
    return null;
  }

  return { timestamp, signature };
}
