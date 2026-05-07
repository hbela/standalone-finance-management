import assert from "node:assert/strict";

import { detectRecurringGroups, normalizeForKey } from "../dist/recurringDetection.js";

const scenarios = [];

function scenario(name, run) {
  scenarios.push({ name, run });
}

const dayMs = 86_400_000;

function tx(overrides) {
  return {
    accountId: "acc-1",
    currency: "EUR",
    type: "expense",
    merchant: "Default Merchant",
    description: "Default description",
    isExcludedFromReports: false,
    ...overrides
  };
}

scenario("detects a monthly subscription with high confidence over three even months", () => {
  const base = Date.parse("2026-02-15T00:00:00.000Z");
  const groups = detectRecurringGroups([
    tx({ _id: "t1", postedAt: base, amount: -9.99, merchant: "Spotify" }),
    tx({ _id: "t2", postedAt: base + 30 * dayMs, amount: -9.99, merchant: "Spotify" }),
    tx({ _id: "t3", postedAt: base + 60 * dayMs, amount: -9.99, merchant: "Spotify" })
  ]);
  assert.equal(groups.length, 1);
  const [group] = groups;
  assert.equal(group.frequency, "monthly");
  assert.equal(group.confidence, "high");
  assert.equal(group.transactionIds.length, 3);
  assert.equal(group.merchant, "Spotify");
  assert.equal(group.averageAmount, -9.99);
  assert.equal(Math.round(group.monthlyAmount * 100) / 100, -9.99);
});

scenario("detects a weekly subscription with medium confidence on two samples", () => {
  const base = Date.parse("2026-04-01T00:00:00.000Z");
  const groups = detectRecurringGroups([
    tx({ _id: "t1", postedAt: base, amount: -3.5, merchant: "Cafe Centrale" }),
    tx({ _id: "t2", postedAt: base + 7 * dayMs, amount: -3.5, merchant: "Cafe Centrale" })
  ]);
  assert.equal(groups.length, 1);
  const [group] = groups;
  assert.equal(group.frequency, "weekly");
  assert.equal(group.confidence, "medium");
  assert.equal(group.transactionIds.length, 2);
  assert.equal(Math.round((group.monthlyAmount + 3.5 * (30 / 7)) * 100) / 100, 0);
});

scenario("ignores transfers, refunds, transfer-matched, and excluded transactions", () => {
  const base = Date.parse("2026-01-01T00:00:00.000Z");
  const groups = detectRecurringGroups([
    tx({ _id: "t1", postedAt: base, amount: -10, type: "transfer", merchant: "Transfer Co" }),
    tx({ _id: "t2", postedAt: base + 30 * dayMs, amount: -10, type: "transfer", merchant: "Transfer Co" }),
    tx({ _id: "t3", postedAt: base, amount: 10, type: "refund", merchant: "Refund Co" }),
    tx({ _id: "t4", postedAt: base + 30 * dayMs, amount: 10, type: "refund", merchant: "Refund Co" }),
    tx({ _id: "t5", postedAt: base, amount: -10, transferMatchId: "other-tx", merchant: "Match Co" }),
    tx({ _id: "t6", postedAt: base + 30 * dayMs, amount: -10, transferMatchId: "other-tx", merchant: "Match Co" }),
    tx({ _id: "t7", postedAt: base, amount: -10, isExcludedFromReports: true, merchant: "Excluded Co" }),
    tx({ _id: "t8", postedAt: base + 30 * dayMs, amount: -10, isExcludedFromReports: true, merchant: "Excluded Co" })
  ]);
  assert.equal(groups.length, 0);
});

scenario("does not group transactions whose intervals are irregular", () => {
  const base = Date.parse("2026-01-01T00:00:00.000Z");
  const groups = detectRecurringGroups([
    tx({ _id: "t1", postedAt: base, amount: -10, merchant: "Random Shop" }),
    tx({ _id: "t2", postedAt: base + 3 * dayMs, amount: -10, merchant: "Random Shop" }),
    tx({ _id: "t3", postedAt: base + 41 * dayMs, amount: -10, merchant: "Random Shop" })
  ]);
  assert.equal(groups.length, 0);
});

scenario("does not collapse two merchants into a single group", () => {
  const base = Date.parse("2026-01-01T00:00:00.000Z");
  const groups = detectRecurringGroups([
    tx({ _id: "t1", postedAt: base, amount: -9.99, merchant: "Netflix" }),
    tx({ _id: "t2", postedAt: base + 30 * dayMs, amount: -9.99, merchant: "Netflix" }),
    tx({ _id: "t3", postedAt: base + 60 * dayMs, amount: -9.99, merchant: "Netflix" }),
    tx({ _id: "t4", postedAt: base, amount: -14.99, merchant: "Spotify" }),
    tx({ _id: "t5", postedAt: base + 30 * dayMs, amount: -14.99, merchant: "Spotify" }),
    tx({ _id: "t6", postedAt: base + 60 * dayMs, amount: -14.99, merchant: "Spotify" })
  ]);
  assert.equal(groups.length, 2);
  const merchants = groups.map((group) => group.merchant).sort();
  assert.deepEqual(merchants, ["Netflix", "Spotify"]);
});

scenario("buckets transactions whose amounts drift by less than 8 percent", () => {
  const base = Date.parse("2026-01-01T00:00:00.000Z");
  const groups = detectRecurringGroups([
    tx({ _id: "t1", postedAt: base, amount: -100, merchant: "Energy Co" }),
    tx({ _id: "t2", postedAt: base + 30 * dayMs, amount: -103, merchant: "Energy Co" }),
    tx({ _id: "t3", postedAt: base + 60 * dayMs, amount: -97, merchant: "Energy Co" })
  ]);
  assert.equal(groups.length, 1);
  const [group] = groups;
  assert.equal(group.transactionIds.length, 3);
  assert.equal(group.confidence, "high");
  assert.equal(Math.round(group.averageAmount), -100);
});

scenario("normalizeForKey strips bank-noise tokens and accents", () => {
  assert.equal(normalizeForKey("CARD PURCHASE Spotify ONLINE"), "spotify");
  assert.equal(normalizeForKey("Café Centrale"), "cafe centrale");
  assert.equal(normalizeForKey("   "), "");
  assert.equal(normalizeForKey(undefined), "");
});

scenario("detects monthly salary deposits as an income-typed group with positive monthlyAmount", () => {
  const base = Date.parse("2026-01-15T00:00:00.000Z");
  const groups = detectRecurringGroups([
    tx({ _id: "p1", postedAt: base, amount: 4500, type: "income", merchant: "Acme Corp" }),
    tx({ _id: "p2", postedAt: base + 30 * dayMs, amount: 4500, type: "income", merchant: "Acme Corp" }),
    tx({ _id: "p3", postedAt: base + 60 * dayMs, amount: 4500, type: "income", merchant: "Acme Corp" })
  ]);
  assert.equal(groups.length, 1);
  const [group] = groups;
  assert.equal(group.type, "income");
  assert.equal(group.frequency, "monthly");
  assert.equal(group.confidence, "high");
  assert.equal(group.averageAmount, 4500);
  assert.equal(group.monthlyAmount, 4500);
  assert.equal(group.merchant, "Acme Corp");
});

scenario("returns income and expense groups in the same pass so callers can route by type", () => {
  const base = Date.parse("2026-01-01T00:00:00.000Z");
  const groups = detectRecurringGroups([
    tx({ _id: "i1", postedAt: base, amount: 4500, type: "income", merchant: "Acme Corp" }),
    tx({ _id: "i2", postedAt: base + 30 * dayMs, amount: 4500, type: "income", merchant: "Acme Corp" }),
    tx({ _id: "i3", postedAt: base + 60 * dayMs, amount: 4500, type: "income", merchant: "Acme Corp" }),
    tx({ _id: "e1", postedAt: base, amount: -9.99, merchant: "Spotify" }),
    tx({ _id: "e2", postedAt: base + 30 * dayMs, amount: -9.99, merchant: "Spotify" }),
    tx({ _id: "e3", postedAt: base + 60 * dayMs, amount: -9.99, merchant: "Spotify" })
  ]);
  assert.equal(groups.length, 2);
  const incomeGroup = groups.find((group) => group.type === "income");
  const expenseGroup = groups.find((group) => group.type === "expense");
  assert.ok(incomeGroup);
  assert.ok(expenseGroup);
  assert.equal(incomeGroup.merchant, "Acme Corp");
  assert.equal(expenseGroup.merchant, "Spotify");
});

scenario("computes monthlyAmount via frequency multiplier (yearly to monthly)", () => {
  const base = Date.parse("2024-01-01T00:00:00.000Z");
  const groups = detectRecurringGroups([
    tx({ _id: "t1", postedAt: base, amount: -120, merchant: "Insurance Co" }),
    tx({ _id: "t2", postedAt: base + 365 * dayMs, amount: -120, merchant: "Insurance Co" }),
    tx({ _id: "t3", postedAt: base + 730 * dayMs, amount: -120, merchant: "Insurance Co" })
  ]);
  assert.equal(groups.length, 1);
  const [group] = groups;
  assert.equal(group.frequency, "yearly");
  assert.equal(Math.round(group.monthlyAmount * 100) / 100, -10);
});

for (const testScenario of scenarios) {
  testScenario.run();
  console.log(`ok - ${testScenario.name}`);
}

console.log(`${scenarios.length} recurring detection scenarios passed`);
