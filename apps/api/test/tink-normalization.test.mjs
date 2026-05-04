import assert from "node:assert/strict";

import { tinkRouteInternals } from "../dist/routes/tink.js";
import { parseTinkAmountValue } from "../dist/tinkClient.js";

const {
  normalizeTinkAccounts,
  normalizeTinkTransactions,
  normalizeTransactionType,
  parseTinkDate
} = tinkRouteInternals;

const scenarios = [];

function scenario(name, run) {
  scenarios.push({ name, run });
}

scenario("normalizes demo bank accounts into local bank accounts", () => {
  const result = normalizeTinkAccounts([
    {
      id: "acc-huf-main",
      name: "  Daily HUF  ",
      type: "CHECKING_ACCOUNT",
      financialInstitutionName: "Demo Bank Hungary",
      balances: {
        booked: {
          amount: {
            value: "145000.75",
            currencyCode: "HUF"
          }
        }
      }
    },
    {
      id: "acc-eur-card",
      type: "CREDIT_CARD",
      financialInstitutionName: "Demo Bank Hungary",
      balance: {
        value: -120.5,
        currencyCode: "EUR"
      }
    }
  ]);

  assert.deepStrictEqual(result, {
    skippedCount: 0,
    accounts: [
      {
        providerAccountId: "acc-huf-main",
        bankKey: "tink:demo-bank-hungary",
        name: "Daily HUF",
        currency: "HUF",
        type: "checking",
        currentBalance: 145000.75
      },
      {
        providerAccountId: "acc-eur-card",
        bankKey: "tink:demo-bank-hungary",
        name: "Demo Bank Hungary",
        currency: "EUR",
        type: "credit",
        currentBalance: -120.5
      }
    ]
  });
});

scenario("skips accounts that cannot be safely imported", () => {
  const result = normalizeTinkAccounts([
    {
      id: "",
      name: "Missing id",
      currencyCode: "HUF"
    },
    {
      id: "acc-chf",
      name: "Unsupported CHF",
      currencyCode: "CHF"
    },
    {
      id: "acc-loan",
      name: "Car Loan",
      type: "loan",
      currencyCode: "EUR",
      balance: {
        value: "-9000"
      }
    }
  ]);

  assert.equal(result.skippedCount, 2);
  assert.deepStrictEqual(result.accounts, [
    {
      providerAccountId: "acc-loan",
      bankKey: undefined,
      name: "Car Loan",
      currency: "EUR",
      type: "loan",
      currentBalance: -9000
    }
  ]);
});

scenario("normalizes posted transactions and creates stable provider dedupe hashes", () => {
  const result = normalizeTinkTransactions([
    {
      id: "tx-grocery-1",
      accountId: "acc-huf-main",
      amount: {
        amount: {
          value: "-10000",
          currencyCode: "HUF"
        }
      },
      descriptions: {
        display: "SPAR Budapest"
      },
      merchantInformation: {
        merchantName: "SPAR"
      },
      category: "groceries",
      dates: {
        booked: "2026-05-03"
      },
      status: "BOOKED"
    },
    {
      id: "tx-refund-1",
      account: {
        id: "acc-eur-card"
      },
      amount: "12.99",
      currencyCode: "EUR",
      reference: "Card refund",
      merchantName: "Online Shop",
      category: "refund",
      bookedDate: "2026-05-04T09:15:00.000Z"
    }
  ]);

  assert.equal(result.skippedCount, 0);
  assert.equal(result.transactions.length, 2);
  const hufTransaction = result.transactions[0];
  assert.ok(hufTransaction);
  assert.equal(Math.round(hufTransaction.baseCurrencyAmount * 100) / 100, -25.4);
  assert.deepStrictEqual(
    {
      ...hufTransaction,
      baseCurrencyAmount: -25.4
    },
    {
      providerAccountId: "acc-huf-main",
      providerTransactionId: "tx-grocery-1",
      postedAt: Date.parse("2026-05-03"),
      amount: -10000,
      currency: "HUF",
      baseCurrencyAmount: -25.4,
      description: "SPAR Budapest",
      merchant: "SPAR",
      categoryId: "groceries",
      type: "expense",
      isRecurring: false,
      isExcludedFromReports: false,
      dedupeHash: "tink|acc-huf-main|tx-grocery-1|2026-05-03|-10000.00|HUF|spar budapest|spar"
    }
  );
  assert.deepStrictEqual(result.transactions[1], {
    providerAccountId: "acc-eur-card",
    providerTransactionId: "tx-refund-1",
    postedAt: Date.parse("2026-05-04T09:15:00.000Z"),
    amount: 12.99,
    currency: "EUR",
    baseCurrencyAmount: 12.99,
    description: "Card refund",
    merchant: "Online Shop",
    categoryId: "refund",
    type: "refund",
    isRecurring: false,
    isExcludedFromReports: false,
    dedupeHash: "tink|acc-eur-card|tx-refund-1|2026-05-04|12.99|EUR|card refund|online shop"
  });
});

scenario("skips pending or incomplete transactions before Convex import", () => {
  const result = normalizeTinkTransactions([
    {
      id: "tx-pending",
      accountId: "acc-huf-main",
      amount: -1000,
      currencyCode: "HUF",
      bookedDate: "2026-05-04",
      status: "pending"
    },
    {
      id: "tx-no-account",
      amount: -1000,
      currencyCode: "HUF",
      bookedDate: "2026-05-04"
    },
    {
      id: "tx-bad-currency",
      accountId: "acc-huf-main",
      amount: -1000,
      currencyCode: "CHF",
      bookedDate: "2026-05-04"
    },
    {
      id: "tx-good",
      accountId: "acc-huf-main",
      amount: {
        value: 450000,
        currencyCode: "HUF"
      },
      description: "Salary",
      category: "salary",
      dates: {
        value: "2026-05-01"
      }
    }
  ]);

  assert.equal(result.skippedCount, 3);
  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0]?.type, "income");
  assert.equal(result.transactions[0]?.description, "Salary");
});

scenario("parses Tink amount and date variants used by sandbox payloads", () => {
  assert.equal(parseTinkAmountValue(42.5), 42.5);
  assert.equal(parseTinkAmountValue("42.5"), 42.5);
  assert.equal(parseTinkAmountValue({ value: "42.5" }), 42.5);
  assert.equal(parseTinkAmountValue({ amount: { value: "42.5" } }), 42.5);
  assert.equal(parseTinkAmountValue("not-a-number"), null);

  assert.equal(parseTinkDate("2026-05-04"), Date.parse("2026-05-04"));
  assert.equal(parseTinkDate("not-a-date"), null);

  assert.equal(normalizeTransactionType(-10, "bank fee"), "fee");
  assert.equal(normalizeTransactionType(10, "refund"), "refund");
  assert.equal(normalizeTransactionType(-10, "groceries"), "expense");
  assert.equal(normalizeTransactionType(10, "salary"), "income");
});

for (const testScenario of scenarios) {
  testScenario.run();
  console.log(`ok - ${testScenario.name}`);
}

console.log(`${scenarios.length} Tink aggregation scenarios passed`);
