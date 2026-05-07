import assert from "node:assert/strict";

import {
  computeExpenseProfiles,
  normalizeCategoryKey,
  pickCategoryLabel
} from "../dist/expenseProfiling.js";

const scenarios = [];

function scenario(name, run) {
  scenarios.push({ name, run });
}

const dayMs = 86_400_000;
const NOW = Date.parse("2026-05-07T00:00:00.000Z");

function tx(overrides) {
  return {
    amount: -50,
    currency: "EUR",
    type: "expense",
    isExcludedFromReports: false,
    ...overrides
  };
}

scenario("rolls three months of groceries into one profile with high confidence", () => {
  const profiles = computeExpenseProfiles(
    [
      tx({ postedAt: Date.parse("2026-03-05T00:00:00.000Z"), amount: -90, categoryId: "Food" }),
      tx({ postedAt: Date.parse("2026-03-19T00:00:00.000Z"), amount: -110, categoryId: "Food" }),
      tx({ postedAt: Date.parse("2026-04-10T00:00:00.000Z"), amount: -200, categoryId: "Food" }),
      tx({ postedAt: Date.parse("2026-05-02T00:00:00.000Z"), amount: -150, categoryId: "Food" })
    ],
    { now: NOW }
  );
  assert.equal(profiles.length, 1);
  const [profile] = profiles;
  assert.equal(profile.category, "Food");
  assert.equal(profile.currency, "EUR");
  assert.equal(profile.monthsObserved, 3);
  assert.equal(profile.transactionCount, 4);
  assert.equal(profile.totalAmount, -550);
  assert.equal(Math.round(profile.monthlyAverage * 100) / 100, -183.33);
  assert.equal(profile.confidence, "high");
});

scenario("flags two-month coverage as medium confidence", () => {
  const profiles = computeExpenseProfiles(
    [
      tx({ postedAt: Date.parse("2026-04-10T00:00:00.000Z"), amount: -50, categoryId: "Transport" }),
      tx({ postedAt: Date.parse("2026-05-04T00:00:00.000Z"), amount: -50, categoryId: "Transport" })
    ],
    { now: NOW }
  );
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].confidence, "medium");
  assert.equal(profiles[0].monthsObserved, 2);
});

scenario("skips categories that only appear in a single month", () => {
  const profiles = computeExpenseProfiles(
    [
      tx({ postedAt: Date.parse("2026-05-03T00:00:00.000Z"), amount: -120, categoryId: "Travel" })
    ],
    { now: NOW }
  );
  assert.equal(profiles.length, 0);
});

scenario("splits the same category across currencies into separate profiles", () => {
  const profiles = computeExpenseProfiles(
    [
      tx({ postedAt: Date.parse("2026-03-15T00:00:00.000Z"), amount: -100, currency: "EUR", categoryId: "Food" }),
      tx({ postedAt: Date.parse("2026-04-15T00:00:00.000Z"), amount: -110, currency: "EUR", categoryId: "Food" }),
      tx({ postedAt: Date.parse("2026-03-20T00:00:00.000Z"), amount: -50000, currency: "HUF", categoryId: "Food" }),
      tx({ postedAt: Date.parse("2026-04-20T00:00:00.000Z"), amount: -55000, currency: "HUF", categoryId: "Food" })
    ],
    { now: NOW }
  );
  assert.equal(profiles.length, 2);
  const eur = profiles.find((profile) => profile.currency === "EUR");
  const huf = profiles.find((profile) => profile.currency === "HUF");
  assert.ok(eur);
  assert.ok(huf);
  assert.equal(eur.category, "Food");
  assert.equal(huf.category, "Food");
});

scenario("ignores income, transfer, refund, transfer-matched, excluded, archived, and out-of-window transactions", () => {
  const profiles = computeExpenseProfiles(
    [
      tx({ postedAt: Date.parse("2026-04-01T00:00:00.000Z"), amount: 5000, type: "income", categoryId: "Salary" }),
      tx({ postedAt: Date.parse("2026-05-01T00:00:00.000Z"), amount: 5000, type: "income", categoryId: "Salary" }),
      tx({ postedAt: Date.parse("2026-04-01T00:00:00.000Z"), amount: -50, type: "transfer", categoryId: "Internal transfer" }),
      tx({ postedAt: Date.parse("2026-05-01T00:00:00.000Z"), amount: -50, type: "transfer", categoryId: "Internal transfer" }),
      tx({ postedAt: Date.parse("2026-04-01T00:00:00.000Z"), amount: 50, type: "refund", categoryId: "Other" }),
      tx({ postedAt: Date.parse("2026-04-15T00:00:00.000Z"), amount: -50, transferMatchId: "tx-match", categoryId: "Food" }),
      tx({ postedAt: Date.parse("2026-04-20T00:00:00.000Z"), amount: -50, isExcludedFromReports: true, categoryId: "Food" }),
      tx({ postedAt: Date.parse("2026-05-01T00:00:00.000Z"), amount: -50, archivedAt: NOW, categoryId: "Food" }),
      tx({ postedAt: Date.parse("2024-01-01T00:00:00.000Z"), amount: -50, categoryId: "Food" })
    ],
    { now: NOW }
  );
  assert.equal(profiles.length, 0);
});

scenario("rolls multiple merchants of the same category into one profile", () => {
  const profiles = computeExpenseProfiles(
    [
      tx({ postedAt: Date.parse("2026-03-01T00:00:00.000Z"), amount: -40, categoryId: "Food", merchant: "SPAR" }),
      tx({ postedAt: Date.parse("2026-04-01T00:00:00.000Z"), amount: -60, categoryId: "Food", merchant: "Tesco" }),
      tx({ postedAt: Date.parse("2026-05-01T00:00:00.000Z"), amount: -50, categoryId: "Food", merchant: "Lidl" })
    ],
    { now: NOW }
  );
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].transactionCount, 3);
  assert.equal(profiles[0].monthsObserved, 3);
  assert.equal(Math.round(profiles[0].monthlyAverage * 100) / 100, -50);
});

scenario("pickCategoryLabel prefers categoryId, falls back to tinkCategoryCode, then Other", () => {
  assert.equal(pickCategoryLabel({ amount: -10, currency: "EUR", type: "expense", postedAt: NOW, categoryId: "Food" }), "Food");
  assert.equal(
    pickCategoryLabel({ amount: -10, currency: "EUR", type: "expense", postedAt: NOW, categoryId: "  ", tinkCategoryCode: "expenses:food" }),
    "expenses:food"
  );
  assert.equal(pickCategoryLabel({ amount: -10, currency: "EUR", type: "expense", postedAt: NOW }), "Other");
});

scenario("normalizeCategoryKey is case-insensitive and accent-stripping", () => {
  assert.equal(normalizeCategoryKey("Café"), "cafe");
  assert.equal(normalizeCategoryKey("FOOD"), "food");
  assert.equal(normalizeCategoryKey("Internal transfer"), "internal transfer");
  assert.equal(normalizeCategoryKey("   "), "");
});

scenario("respects the lookbackMonths option", () => {
  const profiles = computeExpenseProfiles(
    [
      tx({ postedAt: Date.parse("2025-09-01T00:00:00.000Z"), amount: -50, categoryId: "Food" }),
      tx({ postedAt: Date.parse("2025-12-01T00:00:00.000Z"), amount: -50, categoryId: "Food" }),
      tx({ postedAt: Date.parse("2026-04-01T00:00:00.000Z"), amount: -50, categoryId: "Food" })
    ],
    { now: NOW, lookbackMonths: 2 }
  );
  assert.equal(profiles.length, 0);
});

for (const testScenario of scenarios) {
  testScenario.run();
  console.log(`ok - ${testScenario.name}`);
}

console.log(`${scenarios.length} expense profiling scenarios passed`);
