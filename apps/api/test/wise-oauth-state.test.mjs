import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { createWiseState, verifyWiseState, hashOAuthState } from "../dist/oauthState.js";

const scenarios = [];

function scenario(name, run) {
  scenarios.push({ name, run });
}

const SECRET = "test-oauth-secret-do-not-use-in-prod";

scenario("round-trips clerkUserId binding through state payload", () => {
  const state = createWiseState(SECRET, { clerkUserId: "user_abc123" });
  const payload = verifyWiseState(state, SECRET);
  assert.equal(payload.provider, "wise");
  assert.equal(payload.clerkUserId, "user_abc123");
  assert.ok(typeof payload.nonce === "string" && payload.nonce.length > 0);
});

scenario("rejects state signed with a different secret", () => {
  const state = createWiseState(SECRET);
  assert.throws(() => verifyWiseState(state, "wrong-secret"), /signature/i);
});

scenario("rejects malformed states", () => {
  assert.throws(() => verifyWiseState("nope", SECRET), /Invalid OAuth state/);
  assert.throws(() => verifyWiseState(".only-signature", SECRET), /Invalid OAuth state/);
  assert.throws(() => verifyWiseState("only-payload.", SECRET), /Invalid OAuth state/);
});

scenario("rejects a state whose payload is not a wise state", () => {
  const tinkLike = {
    provider: "tink",
    nonce: "deadbeef",
    issuedAt: Date.now()
  };
  const encoded = Buffer.from(JSON.stringify(tinkLike), "utf8").toString("base64url");
  const sig = createHmac("sha256", SECRET).update(encoded).digest("base64url");
  const forged = `${encoded}.${sig}`;
  assert.throws(() => verifyWiseState(forged, SECRET), /payload/);
});

scenario("hashOAuthState returns a stable base64url SHA-256", () => {
  const a = hashOAuthState("hello");
  const b = hashOAuthState("hello");
  const c = hashOAuthState("hello world");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[A-Za-z0-9_-]+$/);
});

scenario("two states for the same user differ thanks to a per-call nonce", () => {
  const a = createWiseState(SECRET, { clerkUserId: "user_x" });
  const b = createWiseState(SECRET, { clerkUserId: "user_x" });
  assert.notEqual(a, b);
});

for (const testScenario of scenarios) {
  testScenario.run();
  console.log(`ok - ${testScenario.name}`);
}

console.log(`${scenarios.length} Wise OAuth state scenarios passed`);
