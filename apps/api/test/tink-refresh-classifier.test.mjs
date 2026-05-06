import assert from "node:assert/strict";

import { refreshRequiresUser } from "../dist/tinkClient.js";

const scenarios = [];

function scenario(name, run) {
  scenarios.push({ name, run });
}

scenario("returns false for 5xx server errors", () => {
  assert.equal(refreshRequiresUser(500, "INTERNAL_ERROR", "boom"), false);
  assert.equal(refreshRequiresUser(502, undefined, "bad gateway"), false);
});

scenario("returns false for 404 not found", () => {
  assert.equal(refreshRequiresUser(404, "NOT_FOUND", "Credential not found"), false);
});

scenario("treats 400 with AUTHENTICATION_ERROR as user-required", () => {
  assert.equal(
    refreshRequiresUser(400, "AUTHENTICATION_ERROR", "Authentication required"),
    true
  );
});

scenario("treats 409 with SUPPLEMENTAL_INFORMATION as user-required", () => {
  assert.equal(
    refreshRequiresUser(409, "SUPPLEMENTAL_INFORMATION_REQUIRED", "Need MFA"),
    true
  );
});

scenario("treats 400 with UPDATE_CONSENT_REQUIRED as user-required", () => {
  assert.equal(refreshRequiresUser(400, "UPDATE_CONSENT_REQUIRED", "consent stale"), true);
});

scenario("treats 400 with SCA in code as user-required", () => {
  assert.equal(refreshRequiresUser(400, "SCA_REQUIRED", "strong customer auth"), true);
});

scenario("treats 400 with SCA-mentioning message but no code as user-required", () => {
  assert.equal(
    refreshRequiresUser(400, undefined, "Please re-authorize the credential."),
    true
  );
});

scenario("treats supplemental-mentioning message as user-required", () => {
  assert.equal(
    refreshRequiresUser(400, undefined, "Supplemental information required"),
    true
  );
});

scenario("treats 400 with generic INVALID_REQUEST as not user-required", () => {
  assert.equal(refreshRequiresUser(400, "INVALID_REQUEST", "bad payload"), false);
});

scenario("is case-insensitive for error code matching", () => {
  assert.equal(
    refreshRequiresUser(400, "authentication_required", "lowercase code"),
    true
  );
});

for (const testScenario of scenarios) {
  testScenario.run();
  console.log(`ok - ${testScenario.name}`);
}

console.log(`${scenarios.length} Tink refresh classifier scenarios passed`);
