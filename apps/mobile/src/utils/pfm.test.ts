import {
  computeBalanceForecast,
  computeExpenseProfiles,
  detectRecurringGroups,
  type DetectableTransaction,
} from "./pfm";

const dayMs = 86_400_000;

// Mirror of apps/api/test/recurring-detection.test.mjs, adapted to mobile's
// SQLite row shape (`id` instead of Convex's `_id`). Logic should be identical.
describe("detectRecurringGroups", () => {
  const baseTx = (
    overrides: Partial<DetectableTransaction> & Pick<DetectableTransaction, "id" | "postedAt" | "amount">
  ): DetectableTransaction => ({
    accountId: "acc-1",
    currency: "EUR",
    type: "expense",
    merchant: "Default Merchant",
    description: "Default description",
    isExcludedFromReports: false,
    ...overrides,
  });

  test("detects a monthly subscription with high confidence over three even months", () => {
    const base = Date.parse("2026-02-15T00:00:00.000Z");
    const groups = detectRecurringGroups([
      baseTx({ id: "t1", postedAt: base, amount: -9.99, merchant: "Spotify" }),
      baseTx({ id: "t2", postedAt: base + 30 * dayMs, amount: -9.99, merchant: "Spotify" }),
      baseTx({ id: "t3", postedAt: base + 60 * dayMs, amount: -9.99, merchant: "Spotify" }),
    ]);
    expect(groups.length).toBe(1);
    const [group] = groups;
    expect(group.frequency).toBe("monthly");
    expect(group.confidence).toBe("high");
    expect(group.transactionIds.length).toBe(3);
    expect(group.merchant).toBe("Spotify");
    expect(group.averageAmount).toBe(-9.99);
    expect(Math.round(group.monthlyAmount * 100) / 100).toBe(-9.99);
  });

  test("detects a weekly subscription with medium confidence on two samples", () => {
    const base = Date.parse("2026-04-01T00:00:00.000Z");
    const groups = detectRecurringGroups([
      baseTx({ id: "t1", postedAt: base, amount: -3.5, merchant: "Cafe Centrale" }),
      baseTx({ id: "t2", postedAt: base + 7 * dayMs, amount: -3.5, merchant: "Cafe Centrale" }),
    ]);
    expect(groups.length).toBe(1);
    const [group] = groups;
    expect(group.frequency).toBe("weekly");
    expect(group.confidence).toBe("medium");
    expect(group.transactionIds.length).toBe(2);
    expect(Math.round((group.monthlyAmount + 3.5 * (30 / 7)) * 100) / 100).toBe(0);
  });

  test("ignores transfers, refunds, transfer-matched, and excluded transactions", () => {
    const base = Date.parse("2026-01-01T00:00:00.000Z");
    const groups = detectRecurringGroups([
      baseTx({ id: "t1", postedAt: base, amount: -10, type: "transfer", merchant: "Transfer Co" }),
      baseTx({ id: "t2", postedAt: base + 30 * dayMs, amount: -10, type: "transfer", merchant: "Transfer Co" }),
      baseTx({ id: "t3", postedAt: base, amount: 10, type: "refund", merchant: "Refund Co" }),
      baseTx({ id: "t4", postedAt: base + 30 * dayMs, amount: 10, type: "refund", merchant: "Refund Co" }),
      baseTx({ id: "t5", postedAt: base, amount: -10, transferMatchId: "other-tx", merchant: "Match Co" }),
      baseTx({ id: "t6", postedAt: base + 30 * dayMs, amount: -10, transferMatchId: "other-tx", merchant: "Match Co" }),
      baseTx({ id: "t7", postedAt: base, amount: -10, isExcludedFromReports: true, merchant: "Excluded Co" }),
      baseTx({ id: "t8", postedAt: base + 30 * dayMs, amount: -10, isExcludedFromReports: true, merchant: "Excluded Co" }),
    ]);
    expect(groups.length).toBe(0);
  });

  test("does not group transactions whose intervals are irregular", () => {
    const base = Date.parse("2026-01-01T00:00:00.000Z");
    const groups = detectRecurringGroups([
      baseTx({ id: "t1", postedAt: base, amount: -10, merchant: "Random Shop" }),
      baseTx({ id: "t2", postedAt: base + 3 * dayMs, amount: -10, merchant: "Random Shop" }),
      baseTx({ id: "t3", postedAt: base + 41 * dayMs, amount: -10, merchant: "Random Shop" }),
    ]);
    expect(groups.length).toBe(0);
  });

  test("does not collapse two merchants into a single group", () => {
    const base = Date.parse("2026-01-01T00:00:00.000Z");
    const groups = detectRecurringGroups([
      baseTx({ id: "t1", postedAt: base, amount: -9.99, merchant: "Netflix" }),
      baseTx({ id: "t2", postedAt: base + 30 * dayMs, amount: -9.99, merchant: "Netflix" }),
      baseTx({ id: "t3", postedAt: base + 60 * dayMs, amount: -9.99, merchant: "Netflix" }),
      baseTx({ id: "t4", postedAt: base, amount: -14.99, merchant: "Spotify" }),
      baseTx({ id: "t5", postedAt: base + 30 * dayMs, amount: -14.99, merchant: "Spotify" }),
      baseTx({ id: "t6", postedAt: base + 60 * dayMs, amount: -14.99, merchant: "Spotify" }),
    ]);
    expect(groups.length).toBe(2);
    const merchants = groups.map((group) => group.merchant).sort();
    expect(merchants).toEqual(["Netflix", "Spotify"]);
  });

  test("buckets transactions whose amounts drift by less than 8 percent", () => {
    const base = Date.parse("2026-01-01T00:00:00.000Z");
    const groups = detectRecurringGroups([
      baseTx({ id: "t1", postedAt: base, amount: -100, merchant: "Energy Co" }),
      baseTx({ id: "t2", postedAt: base + 30 * dayMs, amount: -103, merchant: "Energy Co" }),
      baseTx({ id: "t3", postedAt: base + 60 * dayMs, amount: -97, merchant: "Energy Co" }),
    ]);
    expect(groups.length).toBe(1);
    const [group] = groups;
    expect(group.transactionIds.length).toBe(3);
    expect(group.confidence).toBe("high");
    expect(Math.round(group.averageAmount)).toBe(-100);
  });

  test("detects monthly salary deposits as an income-typed group with positive monthlyAmount", () => {
    const base = Date.parse("2026-01-15T00:00:00.000Z");
    const groups = detectRecurringGroups([
      baseTx({ id: "p1", postedAt: base, amount: 4500, type: "income", merchant: "Acme Corp" }),
      baseTx({ id: "p2", postedAt: base + 30 * dayMs, amount: 4500, type: "income", merchant: "Acme Corp" }),
      baseTx({ id: "p3", postedAt: base + 60 * dayMs, amount: 4500, type: "income", merchant: "Acme Corp" }),
    ]);
    expect(groups.length).toBe(1);
    const [group] = groups;
    expect(group.type).toBe("income");
    expect(group.frequency).toBe("monthly");
    expect(group.confidence).toBe("high");
    expect(group.averageAmount).toBe(4500);
    expect(group.monthlyAmount).toBe(4500);
    expect(group.merchant).toBe("Acme Corp");
  });

  test("returns income and expense groups in the same pass", () => {
    const base = Date.parse("2026-01-01T00:00:00.000Z");
    const groups = detectRecurringGroups([
      baseTx({ id: "i1", postedAt: base, amount: 4500, type: "income", merchant: "Acme Corp" }),
      baseTx({ id: "i2", postedAt: base + 30 * dayMs, amount: 4500, type: "income", merchant: "Acme Corp" }),
      baseTx({ id: "i3", postedAt: base + 60 * dayMs, amount: 4500, type: "income", merchant: "Acme Corp" }),
      baseTx({ id: "e1", postedAt: base, amount: -9.99, merchant: "Spotify" }),
      baseTx({ id: "e2", postedAt: base + 30 * dayMs, amount: -9.99, merchant: "Spotify" }),
      baseTx({ id: "e3", postedAt: base + 60 * dayMs, amount: -9.99, merchant: "Spotify" }),
    ]);
    expect(groups.length).toBe(2);
    const incomeGroup = groups.find((group) => group.type === "income");
    const expenseGroup = groups.find((group) => group.type === "expense");
    expect(incomeGroup?.merchant).toBe("Acme Corp");
    expect(expenseGroup?.merchant).toBe("Spotify");
  });

  test("computes monthlyAmount via frequency multiplier (yearly to monthly)", () => {
    const base = Date.parse("2024-01-01T00:00:00.000Z");
    const groups = detectRecurringGroups([
      baseTx({ id: "t1", postedAt: base, amount: -120, merchant: "Insurance Co" }),
      baseTx({ id: "t2", postedAt: base + 365 * dayMs, amount: -120, merchant: "Insurance Co" }),
      baseTx({ id: "t3", postedAt: base + 730 * dayMs, amount: -120, merchant: "Insurance Co" }),
    ]);
    expect(groups.length).toBe(1);
    const [group] = groups;
    expect(group.frequency).toBe("yearly");
    expect(Math.round(group.monthlyAmount * 100) / 100).toBe(-10);
  });
});

// Mirror of apps/api/test/expense-profiling.test.mjs.
// The api version also exports `pickCategoryLabel` and `normalizeCategoryKey` as
// standalone helpers; the mobile version keeps them inlined, so their behavior is
// exercised indirectly through computeExpenseProfiles instead of unit-tested.
describe("computeExpenseProfiles", () => {
  const NOW = Date.parse("2026-05-07T00:00:00.000Z");
  const baseTx = (
    overrides: Partial<DetectableTransaction> & Pick<DetectableTransaction, "postedAt">
  ): DetectableTransaction => ({
    id: `tx-${overrides.postedAt}-${Math.random()}`,
    accountId: "acc-1",
    amount: -50,
    currency: "EUR",
    type: "expense",
    isExcludedFromReports: false,
    ...overrides,
  });

  test("rolls three months of groceries into one profile with high confidence", () => {
    const profiles = computeExpenseProfiles(
      [
        baseTx({ postedAt: Date.parse("2026-03-05T00:00:00.000Z"), amount: -90, categoryId: "Food" }),
        baseTx({ postedAt: Date.parse("2026-03-19T00:00:00.000Z"), amount: -110, categoryId: "Food" }),
        baseTx({ postedAt: Date.parse("2026-04-10T00:00:00.000Z"), amount: -200, categoryId: "Food" }),
        baseTx({ postedAt: Date.parse("2026-05-02T00:00:00.000Z"), amount: -150, categoryId: "Food" }),
      ],
      { now: NOW }
    );
    expect(profiles.length).toBe(1);
    const [profile] = profiles;
    expect(profile.category).toBe("Food");
    expect(profile.currency).toBe("EUR");
    expect(profile.monthsObserved).toBe(3);
    expect(profile.transactionCount).toBe(4);
    expect(profile.totalAmount).toBe(-550);
    expect(Math.round(profile.monthlyAverage * 100) / 100).toBe(-183.33);
    expect(profile.confidence).toBe("high");
  });

  test("flags two-month coverage as medium confidence", () => {
    const profiles = computeExpenseProfiles(
      [
        baseTx({ postedAt: Date.parse("2026-04-10T00:00:00.000Z"), amount: -50, categoryId: "Transport" }),
        baseTx({ postedAt: Date.parse("2026-05-04T00:00:00.000Z"), amount: -50, categoryId: "Transport" }),
      ],
      { now: NOW }
    );
    expect(profiles.length).toBe(1);
    expect(profiles[0].confidence).toBe("medium");
    expect(profiles[0].monthsObserved).toBe(2);
  });

  test("skips categories that only appear in a single month", () => {
    const profiles = computeExpenseProfiles(
      [baseTx({ postedAt: Date.parse("2026-05-03T00:00:00.000Z"), amount: -120, categoryId: "Travel" })],
      { now: NOW }
    );
    expect(profiles.length).toBe(0);
  });

  test("splits the same category across currencies into separate profiles", () => {
    const profiles = computeExpenseProfiles(
      [
        baseTx({ postedAt: Date.parse("2026-03-15T00:00:00.000Z"), amount: -100, currency: "EUR", categoryId: "Food" }),
        baseTx({ postedAt: Date.parse("2026-04-15T00:00:00.000Z"), amount: -110, currency: "EUR", categoryId: "Food" }),
        baseTx({ postedAt: Date.parse("2026-03-20T00:00:00.000Z"), amount: -50000, currency: "HUF", categoryId: "Food" }),
        baseTx({ postedAt: Date.parse("2026-04-20T00:00:00.000Z"), amount: -55000, currency: "HUF", categoryId: "Food" }),
      ],
      { now: NOW }
    );
    expect(profiles.length).toBe(2);
    const currencies = profiles.map((profile) => profile.currency).sort();
    expect(currencies).toEqual(["EUR", "HUF"]);
  });

  test("ignores income, transfer, refund, transfer-matched, excluded, archived, and out-of-window transactions", () => {
    const profiles = computeExpenseProfiles(
      [
        baseTx({ postedAt: Date.parse("2026-04-01T00:00:00.000Z"), amount: 5000, type: "income", categoryId: "Salary" }),
        baseTx({ postedAt: Date.parse("2026-05-01T00:00:00.000Z"), amount: 5000, type: "income", categoryId: "Salary" }),
        baseTx({ postedAt: Date.parse("2026-04-01T00:00:00.000Z"), amount: -50, type: "transfer", categoryId: "Internal transfer" }),
        baseTx({ postedAt: Date.parse("2026-05-01T00:00:00.000Z"), amount: -50, type: "transfer", categoryId: "Internal transfer" }),
        baseTx({ postedAt: Date.parse("2026-04-01T00:00:00.000Z"), amount: 50, type: "refund", categoryId: "Other" }),
        baseTx({ postedAt: Date.parse("2026-04-15T00:00:00.000Z"), amount: -50, transferMatchId: "tx-match", categoryId: "Food" }),
        baseTx({ postedAt: Date.parse("2026-04-20T00:00:00.000Z"), amount: -50, isExcludedFromReports: true, categoryId: "Food" }),
        baseTx({ postedAt: Date.parse("2026-05-01T00:00:00.000Z"), amount: -50, archivedAt: NOW, categoryId: "Food" }),
        baseTx({ postedAt: Date.parse("2024-01-01T00:00:00.000Z"), amount: -50, categoryId: "Food" }),
      ],
      { now: NOW }
    );
    expect(profiles.length).toBe(0);
  });

  test("rolls multiple merchants of the same category into one profile", () => {
    const profiles = computeExpenseProfiles(
      [
        baseTx({ postedAt: Date.parse("2026-03-01T00:00:00.000Z"), amount: -40, categoryId: "Food", merchant: "SPAR" }),
        baseTx({ postedAt: Date.parse("2026-04-01T00:00:00.000Z"), amount: -60, categoryId: "Food", merchant: "Tesco" }),
        baseTx({ postedAt: Date.parse("2026-05-01T00:00:00.000Z"), amount: -50, categoryId: "Food", merchant: "Lidl" }),
      ],
      { now: NOW }
    );
    expect(profiles.length).toBe(1);
    expect(profiles[0].transactionCount).toBe(3);
    expect(profiles[0].monthsObserved).toBe(3);
    expect(Math.round(profiles[0].monthlyAverage * 100) / 100).toBe(-50);
  });

  test("respects the lookbackMonths option", () => {
    const profiles = computeExpenseProfiles(
      [
        baseTx({ postedAt: Date.parse("2025-09-01T00:00:00.000Z"), amount: -50, categoryId: "Food" }),
        baseTx({ postedAt: Date.parse("2025-12-01T00:00:00.000Z"), amount: -50, categoryId: "Food" }),
        baseTx({ postedAt: Date.parse("2026-04-01T00:00:00.000Z"), amount: -50, categoryId: "Food" }),
      ],
      { now: NOW, lookbackMonths: 2 }
    );
    expect(profiles.length).toBe(0);
  });

  test("falls back to tinkCategoryCode when categoryId is missing", () => {
    const profiles = computeExpenseProfiles(
      [
        baseTx({
          postedAt: Date.parse("2026-03-15T00:00:00.000Z"),
          amount: -40,
          tinkCategoryCode: "expenses:food",
        }),
        baseTx({
          postedAt: Date.parse("2026-04-15T00:00:00.000Z"),
          amount: -50,
          tinkCategoryCode: "expenses:food",
        }),
      ],
      { now: NOW }
    );
    expect(profiles.length).toBe(1);
    expect(profiles[0].category).toBe("expenses:food");
  });
});

// Mirror of apps/api/test/balance-forecasting.test.mjs.
// The mobile version takes `convertToBase` as a dependency (cleaner than the api's
// implicit single-currency filter) — we pass an EUR-only identity here, which
// matches the api's behavior of skipping any event whose currency != input.currency.
describe("computeBalanceForecast", () => {
  const NOW = Date.parse("2026-05-07T00:00:00.000Z");
  const eurOnly = (amount: number, currency: string) =>
    currency === "EUR" ? amount : 0;

  test("returns horizonDays points starting one day after now", () => {
    const result = computeBalanceForecast({
      startingBalance: 1000,
      currency: "EUR",
      now: NOW,
      horizonDays: 30,
      inflows: [],
      outflows: [],
      convertToBase: eurOnly,
    });
    expect(result.points.length).toBe(30);
    expect(result.points[0].date).toBe("2026-05-08");
    expect(result.points[29].date).toBe("2026-06-06");
    expect(result.endingBalance).toBe(1000);
    expect(result.totalInflow).toBe(0);
    expect(result.totalOutflow).toBe(0);
  });

  test("subtracts a monthly subscription on its expected date", () => {
    const nextExpected = NOW + 7 * dayMs;
    const result = computeBalanceForecast({
      startingBalance: 1000,
      currency: "EUR",
      now: NOW,
      horizonDays: 30,
      inflows: [],
      outflows: [
        { amount: -9.99, currency: "EUR", frequency: "monthly", nextExpectedAt: nextExpected },
      ],
      convertToBase: eurOnly,
    });
    expect(result.totalOutflow).toBe(9.99);
    expect(Math.round((1000 - result.endingBalance) * 100) / 100).toBe(9.99);
    const eventDay = result.points.find((point) => point.date === "2026-05-14");
    expect(eventDay?.expectedOutflow).toBe(9.99);
  });

  test("adds a monthly income on its expected date", () => {
    const nextExpected = NOW + 10 * dayMs;
    const result = computeBalanceForecast({
      startingBalance: 0,
      currency: "EUR",
      now: NOW,
      horizonDays: 30,
      inflows: [
        { amount: 4500, currency: "EUR", frequency: "monthly", nextExpectedAt: nextExpected },
      ],
      outflows: [],
      convertToBase: eurOnly,
    });
    expect(result.totalInflow).toBe(4500);
    expect(result.endingBalance).toBe(4500);
    const payday = result.points.find((point) => point.date === "2026-05-17");
    expect(payday?.expectedInflow).toBe(4500);
    expect(payday?.projectedBalance).toBe(4500);
  });

  test("expands weekly subscriptions across the horizon", () => {
    const nextExpected = NOW + 1 * dayMs;
    const result = computeBalanceForecast({
      startingBalance: 100,
      currency: "EUR",
      now: NOW,
      horizonDays: 30,
      inflows: [],
      outflows: [
        { amount: -10, currency: "EUR", frequency: "weekly", nextExpectedAt: nextExpected },
      ],
      convertToBase: eurOnly,
    });
    expect(result.totalOutflow).toBe(50);
    expect(result.endingBalance).toBe(50);
  });

  test("filters by currency — non-matching events are skipped", () => {
    const nextExpected = NOW + 5 * dayMs;
    const result = computeBalanceForecast({
      startingBalance: 100,
      currency: "EUR",
      now: NOW,
      horizonDays: 30,
      inflows: [
        { amount: 4500, currency: "HUF", frequency: "monthly", nextExpectedAt: nextExpected },
      ],
      outflows: [
        { amount: -50, currency: "USD", frequency: "weekly", nextExpectedAt: nextExpected },
      ],
      convertToBase: eurOnly,
    });
    expect(result.totalInflow).toBe(0);
    expect(result.totalOutflow).toBe(0);
    expect(result.endingBalance).toBe(100);
  });

  test("rolls past-due nextExpectedAt forward into the horizon", () => {
    const longAgo = NOW - 100 * dayMs;
    const result = computeBalanceForecast({
      startingBalance: 0,
      currency: "EUR",
      now: NOW,
      horizonDays: 30,
      inflows: [],
      outflows: [
        { amount: -100, currency: "EUR", frequency: "monthly", nextExpectedAt: longAgo },
      ],
      convertToBase: eurOnly,
    });
    expect(result.totalOutflow).toBeGreaterThanOrEqual(100);
  });

  test("treats outflow amounts as magnitudes regardless of sign", () => {
    const nextExpected = NOW + 5 * dayMs;
    const result = computeBalanceForecast({
      startingBalance: 1000,
      currency: "EUR",
      now: NOW,
      horizonDays: 30,
      inflows: [],
      outflows: [
        { amount: -25, currency: "EUR", frequency: "monthly", nextExpectedAt: nextExpected },
        { amount: 25, currency: "EUR", frequency: "monthly", nextExpectedAt: nextExpected + 1 * dayMs },
      ],
      convertToBase: eurOnly,
    });
    expect(result.totalOutflow).toBe(50);
    expect(result.endingBalance).toBe(950);
  });

  test("running balance accumulates monotonically across days", () => {
    const result = computeBalanceForecast({
      startingBalance: 500,
      currency: "EUR",
      now: NOW,
      horizonDays: 14,
      inflows: [
        { amount: 100, currency: "EUR", frequency: "weekly", nextExpectedAt: NOW + 1 * dayMs },
      ],
      outflows: [
        { amount: -20, currency: "EUR", frequency: "weekly", nextExpectedAt: NOW + 3 * dayMs },
      ],
      convertToBase: eurOnly,
    });
    expect(result.totalInflow).toBe(200);
    expect(result.totalOutflow).toBe(40);
    expect(result.endingBalance).toBe(660);
    for (let i = 1; i < result.points.length; i += 1) {
      const previous = result.points[i - 1].projectedBalance;
      const current = result.points[i].projectedBalance;
      const expectedInflow = result.points[i].expectedInflow;
      const expectedOutflow = result.points[i].expectedOutflow;
      expect(current).toBe(previous + expectedInflow - expectedOutflow);
    }
  });

  test("ignores events with non-finite nextExpectedAt or zero magnitude", () => {
    const result = computeBalanceForecast({
      startingBalance: 100,
      currency: "EUR",
      now: NOW,
      horizonDays: 30,
      inflows: [{ amount: 0, currency: "EUR", frequency: "weekly", nextExpectedAt: NOW + 1 * dayMs }],
      outflows: [
        { amount: -50, currency: "EUR", frequency: "weekly", nextExpectedAt: Number.NaN },
      ],
      convertToBase: eurOnly,
    });
    expect(result.totalInflow).toBe(0);
    expect(result.totalOutflow).toBe(0);
    expect(result.endingBalance).toBe(100);
  });
});
