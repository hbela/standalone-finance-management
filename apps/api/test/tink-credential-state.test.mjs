import assert from "node:assert/strict";

import {
  aggregateCredentialStates,
  classifyTinkCredentialStatus
} from "../dist/tinkCredentialState.js";

const scenarios = [];

function scenario(name, run) {
  scenarios.push({ name, run });
}

scenario("classifies AUTHENTICATION_ERROR as reconnect_required", () => {
  const state = classifyTinkCredentialStatus({ status: "AUTHENTICATION_ERROR" });
  assert.equal(state.kind, "reconnect_required");
  assert.equal(state.code, "AUTHENTICATION_ERROR");
});

scenario("classifies SESSION_EXPIRED as reconnect_required", () => {
  const state = classifyTinkCredentialStatus({ status: "SESSION_EXPIRED" });
  assert.equal(state.kind, "reconnect_required");
});

scenario("classifies DELETED as reconnect_required", () => {
  const state = classifyTinkCredentialStatus({ status: "DELETED" });
  assert.equal(state.kind, "reconnect_required");
});

scenario("classifies TEMPORARY_ERROR as temporary", () => {
  const state = classifyTinkCredentialStatus({ status: "TEMPORARY_ERROR" });
  assert.equal(state.kind, "temporary");
  assert.equal(state.code, "TEMPORARY_ERROR");
});

scenario("classifies UPDATED as ok", () => {
  const state = classifyTinkCredentialStatus({ status: "UPDATED" });
  assert.equal(state.kind, "ok");
});

scenario("classifies UPDATING as ok", () => {
  const state = classifyTinkCredentialStatus({ status: "UPDATING" });
  assert.equal(state.kind, "ok");
});

scenario("classifies AWAITING_MOBILE_BANKID_AUTHENTICATION as ok", () => {
  const state = classifyTinkCredentialStatus({
    status: "AWAITING_MOBILE_BANKID_AUTHENTICATION"
  });
  assert.equal(state.kind, "ok");
});

scenario("classifies missing status as unknown without code", () => {
  const state = classifyTinkCredentialStatus({});
  assert.equal(state.kind, "unknown");
  assert.equal(state.code, undefined);
});

scenario("classifies unfamiliar status as unknown but preserves the code", () => {
  const state = classifyTinkCredentialStatus({ status: "FOO_BAR" });
  assert.equal(state.kind, "unknown");
  assert.equal(state.code, "FOO_BAR");
});

scenario("classifies status case-insensitively", () => {
  const state = classifyTinkCredentialStatus({ status: "authentication_error" });
  assert.equal(state.kind, "reconnect_required");
  assert.equal(state.code, "AUTHENTICATION_ERROR");
});

scenario("aggregates an empty credential list as reconnect_required", () => {
  const result = aggregateCredentialStates([]);
  assert.equal(result.kind, "reconnect_required");
  assert.equal(result.code, "NO_CREDENTIALS");
});

scenario("aggregates picks the first reconnect_required credential", () => {
  const result = aggregateCredentialStates([
    { id: "cred-ok", status: "UPDATED" },
    { id: "cred-broken", status: "AUTHENTICATION_ERROR" },
    { id: "cred-temp", status: "TEMPORARY_ERROR" }
  ]);
  assert.equal(result.kind, "reconnect_required");
  assert.equal(result.code, "AUTHENTICATION_ERROR");
  assert.equal(result.credentialId, "cred-broken");
});

scenario("aggregates falls back to temporary when no reconnect_required", () => {
  const result = aggregateCredentialStates([
    { id: "cred-ok", status: "UPDATED" },
    { id: "cred-temp", status: "TEMPORARY_ERROR" }
  ]);
  assert.equal(result.kind, "temporary");
  assert.equal(result.credentialId, "cred-temp");
});

scenario("aggregates returns ok when every credential is healthy", () => {
  const result = aggregateCredentialStates([
    { id: "cred-1", status: "UPDATED" },
    { id: "cred-2", status: "UPDATING" }
  ]);
  assert.equal(result.kind, "ok");
});

scenario("aggregates returns unknown only if no reconnect/temporary present", () => {
  const result = aggregateCredentialStates([
    { id: "cred-mystery", status: "MYSTERY_STATE" }
  ]);
  assert.equal(result.kind, "unknown");
  assert.equal(result.code, "MYSTERY_STATE");
  assert.equal(result.credentialId, "cred-mystery");
});

for (const testScenario of scenarios) {
  testScenario.run();
  console.log(`ok - ${testScenario.name}`);
}

console.log(`${scenarios.length} Tink credential-state scenarios passed`);
