import assert from "node:assert/strict";

import {
  parseConsentExpiry,
  pickPrimaryProviderConsent
} from "../dist/tinkConsent.js";

const scenarios = [];

function scenario(name, run) {
  scenarios.push({ name, run });
}

scenario("parseConsentExpiry passes through positive numeric epoch", () => {
  const value = 1_770_000_000_000;
  assert.equal(parseConsentExpiry(value), value);
});

scenario("parseConsentExpiry parses ISO-8601 strings", () => {
  const iso = "2027-03-01T00:00:00.000Z";
  assert.equal(parseConsentExpiry(iso), Date.parse(iso));
});

scenario("parseConsentExpiry parses numeric strings as epoch", () => {
  assert.equal(parseConsentExpiry("1770000000000"), 1_770_000_000_000);
});

scenario("parseConsentExpiry returns undefined for falsy or unparseable values", () => {
  assert.equal(parseConsentExpiry(undefined), undefined);
  assert.equal(parseConsentExpiry(""), undefined);
  assert.equal(parseConsentExpiry("not-a-date"), undefined);
  assert.equal(parseConsentExpiry(0), undefined);
  assert.equal(parseConsentExpiry(-1), undefined);
});

scenario("pickPrimaryProviderConsent returns null for empty consents", () => {
  assert.equal(pickPrimaryProviderConsent([]), null);
});

scenario("pickPrimaryProviderConsent prefers a matching credentialsId", () => {
  const result = pickPrimaryProviderConsent(
    [
      {
        credentialsId: "cred-other",
        providerName: "demo-other",
        sessionExpiryDate: 1_700_000_000_000
      },
      {
        credentialsId: "cred-target",
        providerName: "demo-target",
        sessionExpiryDate: 1_770_000_000_000
      }
    ],
    "cred-target"
  );

  assert.deepStrictEqual(result, {
    credentialsId: "cred-target",
    providerName: "demo-target",
    consentExpiresAt: 1_770_000_000_000
  });
});

scenario("pickPrimaryProviderConsent falls back to the first consent when no match", () => {
  const result = pickPrimaryProviderConsent(
    [
      {
        credentialsId: "cred-first",
        providerName: "demo-first",
        sessionExpiryDate: "2027-04-15T12:00:00.000Z"
      },
      {
        credentialsId: "cred-second",
        providerName: "demo-second"
      }
    ],
    "cred-missing"
  );

  assert.deepStrictEqual(result, {
    credentialsId: "cred-first",
    providerName: "demo-first",
    consentExpiresAt: Date.parse("2027-04-15T12:00:00.000Z")
  });
});

scenario("pickPrimaryProviderConsent omits consentExpiresAt when not parseable", () => {
  const result = pickPrimaryProviderConsent([
    {
      credentialsId: "cred-only",
      providerName: "demo",
      sessionExpiryDate: undefined
    }
  ]);

  assert.deepStrictEqual(result, {
    credentialsId: "cred-only",
    providerName: "demo",
    consentExpiresAt: undefined
  });
});

for (const testScenario of scenarios) {
  testScenario.run();
  console.log(`ok - ${testScenario.name}`);
}

console.log(`${scenarios.length} Tink consent scenarios passed`);
