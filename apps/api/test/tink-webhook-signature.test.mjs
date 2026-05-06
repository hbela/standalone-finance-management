import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { verifyTinkSignature } from "../dist/tinkWebhookSignature.js";

const scenarios = [];

function scenario(name, run) {
  scenarios.push({ name, run });
}

function signature(secret, timestamp, body) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

const secret = "whsec_demo";
const body = JSON.stringify({ id: "evt-1", event: "refresh:finished" });
const fixedNow = () => 1_770_000_000_000;
const fixedTimestamp = Math.floor(fixedNow() / 1000);

scenario("accepts a valid signature within tolerance", () => {
  const sig = signature(secret, fixedTimestamp, body);
  const result = verifyTinkSignature({
    header: `t=${fixedTimestamp},v1=${sig}`,
    rawBody: body,
    secret,
    toleranceSeconds: 300,
    now: fixedNow
  });
  assert.equal(result.valid, true);
  assert.equal(result.timestamp, fixedTimestamp);
});

scenario("rejects when the header is missing", () => {
  const result = verifyTinkSignature({
    header: undefined,
    rawBody: body,
    secret,
    toleranceSeconds: 300,
    now: fixedNow
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "missing_header");
});

scenario("rejects when the header is malformed", () => {
  const result = verifyTinkSignature({
    header: "not-a-real-header",
    rawBody: body,
    secret,
    toleranceSeconds: 300,
    now: fixedNow
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "malformed_header");
});

scenario("rejects when the timestamp is outside tolerance", () => {
  const ancient = fixedTimestamp - 600;
  const sig = signature(secret, ancient, body);
  const result = verifyTinkSignature({
    header: `t=${ancient},v1=${sig}`,
    rawBody: body,
    secret,
    toleranceSeconds: 300,
    now: fixedNow
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "timestamp_out_of_tolerance");
});

scenario("rejects when the body is tampered", () => {
  const sig = signature(secret, fixedTimestamp, body);
  const result = verifyTinkSignature({
    header: `t=${fixedTimestamp},v1=${sig}`,
    rawBody: `${body}!`,
    secret,
    toleranceSeconds: 300,
    now: fixedNow
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "signature_mismatch");
});

scenario("rejects when the signature uses a wrong secret", () => {
  const sig = signature("whsec_other", fixedTimestamp, body);
  const result = verifyTinkSignature({
    header: `t=${fixedTimestamp},v1=${sig}`,
    rawBody: body,
    secret,
    toleranceSeconds: 300,
    now: fixedNow
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "signature_mismatch");
});

scenario("rejects when v1 is missing from the header", () => {
  const result = verifyTinkSignature({
    header: `t=${fixedTimestamp}`,
    rawBody: body,
    secret,
    toleranceSeconds: 300,
    now: fixedNow
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "malformed_header");
});

scenario("rejects when t is missing from the header", () => {
  const sig = signature(secret, fixedTimestamp, body);
  const result = verifyTinkSignature({
    header: `v1=${sig}`,
    rawBody: body,
    secret,
    toleranceSeconds: 300,
    now: fixedNow
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "malformed_header");
});

scenario("ignores extra header pairs and uses v1 + t", () => {
  const sig = signature(secret, fixedTimestamp, body);
  const result = verifyTinkSignature({
    header: `extra=ok,t=${fixedTimestamp},v0=ignored,v1=${sig}`,
    rawBody: body,
    secret,
    toleranceSeconds: 300,
    now: fixedNow
  });
  assert.equal(result.valid, true);
});

for (const testScenario of scenarios) {
  testScenario.run();
  console.log(`ok - ${testScenario.name}`);
}

console.log(`${scenarios.length} Tink webhook signature scenarios passed`);
