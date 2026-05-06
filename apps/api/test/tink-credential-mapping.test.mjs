import assert from "node:assert/strict";

import { buildTinkCredentialRows } from "../dist/tinkCredentialMapping.js";

const scenarios = [];

function scenario(name, run) {
  scenarios.push({ name, run });
}

scenario("maps a healthy credential without consent to status connected", () => {
  const rows = buildTinkCredentialRows(
    [{ id: "cred-1", providerName: "demo-bank", status: "UPDATED" }],
    []
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].credentialsId, "cred-1");
  assert.equal(rows[0].status, "connected");
  assert.equal(rows[0].statusCode, "UPDATED");
  assert.equal(rows[0].consentExpiresAt, undefined);
});

scenario("merges credential and matching consent", () => {
  const expiry = 1_770_000_000_000;
  const rows = buildTinkCredentialRows(
    [{ id: "cred-1", providerName: "demo-bank", status: "UPDATED" }],
    [{ credentialsId: "cred-1", sessionExpiryDate: expiry, sessionExtendable: true }]
  );
  assert.equal(rows[0].consentExpiresAt, expiry);
  assert.equal(rows[0].sessionExtendable, true);
});

scenario("maps AUTHENTICATION_ERROR credential to reconnect_required status", () => {
  const rows = buildTinkCredentialRows(
    [{ id: "cred-broken", providerName: "demo-bank", status: "AUTHENTICATION_ERROR" }],
    []
  );
  assert.equal(rows[0].status, "reconnect_required");
  assert.equal(rows[0].statusCode, "AUTHENTICATION_ERROR");
});

scenario("maps TEMPORARY_ERROR credential to temporary_error status", () => {
  const rows = buildTinkCredentialRows(
    [{ id: "cred-temp", providerName: "demo-bank", status: "TEMPORARY_ERROR" }],
    []
  );
  assert.equal(rows[0].status, "temporary_error");
});

scenario("maps unfamiliar status to unknown", () => {
  const rows = buildTinkCredentialRows(
    [{ id: "cred-mystery", providerName: "demo-bank", status: "WHATEVER" }],
    []
  );
  assert.equal(rows[0].status, "unknown");
  assert.equal(rows[0].statusCode, "WHATEVER");
});

scenario("skips credentials missing an id", () => {
  const rows = buildTinkCredentialRows(
    [
      { providerName: "demo-bank", status: "UPDATED" },
      { id: "cred-1", providerName: "demo-bank", status: "UPDATED" }
    ],
    []
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].credentialsId, "cred-1");
});

scenario("returns one row per credential preserving order", () => {
  const rows = buildTinkCredentialRows(
    [
      { id: "cred-1", providerName: "bank-a", status: "UPDATED" },
      { id: "cred-2", providerName: "bank-b", status: "AUTHENTICATION_ERROR" },
      { id: "cred-3", providerName: "bank-c", status: "TEMPORARY_ERROR" }
    ],
    [
      { credentialsId: "cred-2", sessionExpiryDate: "2027-04-15T12:00:00.000Z" },
      { credentialsId: "cred-3", sessionExpiryDate: 1_770_000_000_000 }
    ]
  );
  assert.equal(rows.length, 3);
  assert.equal(rows[0].credentialsId, "cred-1");
  assert.equal(rows[1].credentialsId, "cred-2");
  assert.equal(rows[1].consentExpiresAt, Date.parse("2027-04-15T12:00:00.000Z"));
  assert.equal(rows[2].consentExpiresAt, 1_770_000_000_000);
});

for (const testScenario of scenarios) {
  testScenario.run();
  console.log(`ok - ${testScenario.name}`);
}

console.log(`${scenarios.length} Tink credential mapping scenarios passed`);
