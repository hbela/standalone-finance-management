import assert from "node:assert/strict";

import { computeBalanceForecast } from "../dist/balanceForecasting.js";

const scenarios = [];

function scenario(name, run) {
  scenarios.push({ name, run });
}

const dayMs = 86_400_000;
const NOW = Date.parse("2026-05-07T00:00:00.000Z");

scenario("returns horizonDays points starting one day after now", () => {
  const result = computeBalanceForecast({
    startingBalance: 1000,
    currency: "EUR",
    now: NOW,
    horizonDays: 30,
    inflows: [],
    outflows: []
  });
  assert.equal(result.points.length, 30);
  assert.equal(result.points[0].date, "2026-05-08");
  assert.equal(result.points[29].date, "2026-06-06");
  assert.equal(result.endingBalance, 1000);
  assert.equal(result.totalInflow, 0);
  assert.equal(result.totalOutflow, 0);
});

scenario("subtracts a monthly subscription on its expected date", () => {
  const nextExpected = NOW + 7 * dayMs;
  const result = computeBalanceForecast({
    startingBalance: 1000,
    currency: "EUR",
    now: NOW,
    horizonDays: 30,
    inflows: [],
    outflows: [
      { amount: -9.99, currency: "EUR", frequency: "monthly", nextExpectedAt: nextExpected }
    ]
  });
  assert.equal(result.totalOutflow, 9.99);
  assert.equal(Math.round((1000 - result.endingBalance) * 100) / 100, 9.99);
  const eventDay = result.points.find((point) => point.date === "2026-05-14");
  assert.ok(eventDay);
  assert.equal(eventDay.expectedOutflow, 9.99);
});

scenario("adds a monthly income on its expected date", () => {
  const nextExpected = NOW + 10 * dayMs;
  const result = computeBalanceForecast({
    startingBalance: 0,
    currency: "EUR",
    now: NOW,
    horizonDays: 30,
    inflows: [
      { amount: 4500, currency: "EUR", frequency: "monthly", nextExpectedAt: nextExpected }
    ],
    outflows: []
  });
  assert.equal(result.totalInflow, 4500);
  assert.equal(result.endingBalance, 4500);
  const payday = result.points.find((point) => point.date === "2026-05-17");
  assert.ok(payday);
  assert.equal(payday.expectedInflow, 4500);
  assert.equal(payday.projectedBalance, 4500);
});

scenario("expands weekly subscriptions across the horizon", () => {
  const nextExpected = NOW + 1 * dayMs;
  const result = computeBalanceForecast({
    startingBalance: 100,
    currency: "EUR",
    now: NOW,
    horizonDays: 30,
    inflows: [],
    outflows: [
      { amount: -10, currency: "EUR", frequency: "weekly", nextExpectedAt: nextExpected }
    ]
  });
  // first event 2026-05-08, then 05-15, 05-22, 05-29, 06-05 = 5 events in 30 days
  assert.equal(result.totalOutflow, 50);
  assert.equal(result.endingBalance, 50);
});

scenario("filters by currency — non-matching events are skipped", () => {
  const nextExpected = NOW + 5 * dayMs;
  const result = computeBalanceForecast({
    startingBalance: 100,
    currency: "EUR",
    now: NOW,
    horizonDays: 30,
    inflows: [
      { amount: 4500, currency: "HUF", frequency: "monthly", nextExpectedAt: nextExpected }
    ],
    outflows: [
      { amount: -50, currency: "USD", frequency: "weekly", nextExpectedAt: nextExpected }
    ]
  });
  assert.equal(result.totalInflow, 0);
  assert.equal(result.totalOutflow, 0);
  assert.equal(result.endingBalance, 100);
});

scenario("rolls past-due nextExpectedAt forward into the horizon", () => {
  const longAgo = NOW - 100 * dayMs;
  const result = computeBalanceForecast({
    startingBalance: 0,
    currency: "EUR",
    now: NOW,
    horizonDays: 30,
    inflows: [],
    outflows: [
      { amount: -100, currency: "EUR", frequency: "monthly", nextExpectedAt: longAgo }
    ]
  });
  assert.ok(result.totalOutflow >= 100, "expected at least one rolled-forward event in the horizon");
});

scenario("treats outflow amounts as magnitudes regardless of sign", () => {
  const nextExpected = NOW + 5 * dayMs;
  const result = computeBalanceForecast({
    startingBalance: 1000,
    currency: "EUR",
    now: NOW,
    horizonDays: 30,
    inflows: [],
    outflows: [
      { amount: -25, currency: "EUR", frequency: "monthly", nextExpectedAt: nextExpected },
      { amount: 25, currency: "EUR", frequency: "monthly", nextExpectedAt: nextExpected + 1 * dayMs }
    ]
  });
  assert.equal(result.totalOutflow, 50);
  assert.equal(result.endingBalance, 950);
});

scenario("running balance accumulates monotonically across days", () => {
  const result = computeBalanceForecast({
    startingBalance: 500,
    currency: "EUR",
    now: NOW,
    horizonDays: 14,
    inflows: [
      { amount: 100, currency: "EUR", frequency: "weekly", nextExpectedAt: NOW + 1 * dayMs }
    ],
    outflows: [
      { amount: -20, currency: "EUR", frequency: "weekly", nextExpectedAt: NOW + 3 * dayMs }
    ]
  });
  // weekly schedule: inflows on day 1, 8 (+200) ; outflows on day 3, 10 (-40)
  assert.equal(result.totalInflow, 200);
  assert.equal(result.totalOutflow, 40);
  assert.equal(result.endingBalance, 660);
  // day-by-day balance must be non-decreasing relative to inflow/outflow events only
  for (let i = 1; i < result.points.length; i += 1) {
    const previous = result.points[i - 1].projectedBalance;
    const current = result.points[i].projectedBalance;
    const expectedInflow = result.points[i].expectedInflow;
    const expectedOutflow = result.points[i].expectedOutflow;
    assert.equal(current, previous + expectedInflow - expectedOutflow);
  }
});

scenario("ignores events with non-finite nextExpectedAt or zero magnitude", () => {
  const result = computeBalanceForecast({
    startingBalance: 100,
    currency: "EUR",
    now: NOW,
    horizonDays: 30,
    inflows: [{ amount: 0, currency: "EUR", frequency: "weekly", nextExpectedAt: NOW + 1 * dayMs }],
    outflows: [
      { amount: -50, currency: "EUR", frequency: "weekly", nextExpectedAt: Number.NaN }
    ]
  });
  assert.equal(result.totalInflow, 0);
  assert.equal(result.totalOutflow, 0);
  assert.equal(result.endingBalance, 100);
});

for (const testScenario of scenarios) {
  testScenario.run();
  console.log(`ok - ${testScenario.name}`);
}

console.log(`${scenarios.length} balance forecasting scenarios passed`);
