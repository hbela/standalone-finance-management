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

scenario("normalizes demo bank accounts into local bank accounts with holder/institution metadata", () => {
  const result = normalizeTinkAccounts([
    {
      id: "acc-huf-main",
      name: "  Daily HUF  ",
      type: "CHECKING_ACCOUNT",
      financialInstitutionName: "Demo Bank Hungary",
      holderName: "  Béla Hajzer  ",
      credentialsId: "cred-otp",
      identifiers: [
        { scheme: "iban", value: "HU42117730161111101800000000" },
        { scheme: "bban", value: "11773016-11111018-00000000" }
      ],
      balances: {
        booked: {
          amount: {
            value: "145000.75",
            currencyCode: "HUF"
          }
        },
        available: {
          amount: {
            value: "140000",
            currencyCode: "HUF"
          }
        }
      }
    },
    {
      id: "acc-eur-card",
      type: "CREDIT_CARD",
      financialInstitutionName: "Demo Bank Hungary",
      holders: [{ name: "Wise Finance Demo" }],
      credentials: { id: "cred-erste" },
      identifiers: [{ iban: { iban: "DE89370400440532013000" } }],
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
        currentBalance: 145000.75,
        availableBalance: 140000,
        institutionName: "Demo Bank Hungary",
        holderName: "Béla Hajzer",
        iban: "HU42117730161111101800000000",
        bban: "11773016-11111018-00000000",
        credentialsId: "cred-otp"
      },
      {
        providerAccountId: "acc-eur-card",
        bankKey: "tink:demo-bank-hungary",
        name: "Demo Bank Hungary",
        currency: "EUR",
        type: "credit",
        currentBalance: -120.5,
        availableBalance: undefined,
        institutionName: "Demo Bank Hungary",
        holderName: "Wise Finance Demo",
        iban: "DE89370400440532013000",
        bban: undefined,
        credentialsId: "cred-erste"
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
      currentBalance: -9000,
      availableBalance: undefined,
      institutionName: undefined,
      holderName: undefined,
      iban: undefined,
      bban: undefined,
      credentialsId: undefined
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
      categoryId: "Food",
      tinkCategoryCode: "groceries",
      type: "expense",
      isRecurring: false,
      isExcludedFromReports: false,
      status: "booked",
      dedupeHash: "tink|acc-huf-main|2026-05-03|-10000.00|HUF|spar budapest|spar"
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
    categoryId: "Other",
    tinkCategoryCode: "refund",
    type: "refund",
    isRecurring: false,
    isExcludedFromReports: false,
    status: "booked",
    dedupeHash: "tink|acc-eur-card|2026-05-04|12.99|EUR|card refund|online shop"
  });
});

scenario("resolves Tink taxonomy category codes to app categories and preserves the raw code", () => {
  const result = normalizeTinkTransactions([
    {
      id: "tx-food-tax",
      accountId: "acc-eur-card",
      amount: { value: -42.5, currencyCode: "EUR" },
      descriptions: { display: "SPAR Wien" },
      category: "expenses:food.groceries",
      bookedDate: "2026-05-04"
    },
    {
      id: "tx-utilities-tax",
      accountId: "acc-eur-card",
      amount: { value: -100, currencyCode: "EUR" },
      description: "ELMU Budapest",
      category: "expenses:home.utilities.electricity",
      bookedDate: "2026-05-04"
    },
    {
      id: "tx-unknown-tax",
      accountId: "acc-eur-card",
      amount: { value: -5, currencyCode: "EUR" },
      description: "Mystery merchant",
      category: "expenses:something-tink-invented-yesterday",
      bookedDate: "2026-05-04"
    }
  ]);

  assert.equal(result.skippedCount, 0);
  const food = result.transactions.find((tx) => tx.providerTransactionId === "tx-food-tax");
  assert.ok(food);
  assert.equal(food.categoryId, "Food");
  assert.equal(food.tinkCategoryCode, "expenses:food.groceries");

  const utilities = result.transactions.find((tx) => tx.providerTransactionId === "tx-utilities-tax");
  assert.ok(utilities);
  assert.equal(utilities.categoryId, "Utilities");
  assert.equal(utilities.tinkCategoryCode, "expenses:home.utilities.electricity");

  const unknown = result.transactions.find((tx) => tx.providerTransactionId === "tx-unknown-tax");
  assert.ok(unknown);
  assert.equal(unknown.categoryId, undefined);
  assert.equal(unknown.tinkCategoryCode, "expenses:something-tink-invented-yesterday");
});

scenario("retains pending transactions and skips structurally incomplete rows", () => {
  const result = normalizeTinkTransactions([
    {
      id: "tx-pending",
      accountId: "acc-huf-main",
      amount: -1000,
      currencyCode: "HUF",
      description: "Pending coffee",
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

  assert.equal(result.skippedCount, 2);
  assert.equal(result.transactions.length, 2);

  const pending = result.transactions.find((tx) => tx.providerTransactionId === "tx-pending");
  assert.ok(pending);
  assert.equal(pending.status, "pending");

  const booked = result.transactions.find((tx) => tx.providerTransactionId === "tx-good");
  assert.ok(booked);
  assert.equal(booked.status, "booked");
  assert.equal(booked.type, "income");
  assert.equal(booked.description, "Salary");
});

scenario("pending and booked twins of the same transaction produce the same dedupe hash", () => {
  const result = normalizeTinkTransactions([
    {
      id: "tx-coffee-pending",
      accountId: "acc-huf-main",
      amount: -1500,
      currencyCode: "HUF",
      description: "Cafe Centrale",
      merchantInformation: { merchantName: "Cafe Centrale" },
      bookedDate: "2026-05-04",
      status: "PENDING"
    },
    {
      id: "tx-coffee-booked",
      accountId: "acc-huf-main",
      amount: -1500,
      currencyCode: "HUF",
      description: "Cafe Centrale",
      merchantInformation: { merchantName: "Cafe Centrale" },
      bookedDate: "2026-05-04",
      status: "BOOKED"
    }
  ]);

  assert.equal(result.transactions.length, 2);
  const [pending, booked] = result.transactions;
  assert.equal(pending.status, "pending");
  assert.equal(booked.status, "booked");
  assert.equal(pending.dedupeHash, booked.dedupeHash);
  assert.notEqual(pending.providerTransactionId, booked.providerTransactionId);
});

scenario("parses Tink amount and date variants used by sandbox payloads", () => {
  assert.equal(parseTinkAmountValue(42.5), 42.5);
  assert.equal(parseTinkAmountValue("42.5"), 42.5);
  assert.equal(parseTinkAmountValue({ value: "42.5" }), 42.5);
  assert.equal(parseTinkAmountValue({ amount: { value: "42.5" } }), 42.5);
  assert.equal(parseTinkAmountValue("not-a-number"), null);

  assert.equal(
    parseTinkAmountValue({ amount: { value: { unscaledValue: "1234", scale: "2" } } }),
    12.34
  );
  assert.equal(
    parseTinkAmountValue({ value: { unscaledValue: -50000, scale: 2 } }),
    -500
  );
  assert.equal(
    parseTinkAmountValue({ amount: { value: { unscaledValue: "1234", scale: "0" } } }),
    1234
  );
  assert.equal(
    parseTinkAmountValue({ amount: { value: { unscaledValue: "abc", scale: "2" } } }),
    null
  );

  assert.equal(parseTinkDate("2026-05-04"), Date.parse("2026-05-04"));
  assert.equal(parseTinkDate("not-a-date"), null);

  assert.equal(normalizeTransactionType(-10, "bank fee"), "fee");
  assert.equal(normalizeTransactionType(10, "refund"), "refund");
  assert.equal(normalizeTransactionType(-10, "groceries"), "expense");
  assert.equal(normalizeTransactionType(10, "salary"), "income");
});

scenario("normalizes a sandbox transaction using the scaled-decimal amount shape", () => {
  const result = normalizeTinkTransactions([
    {
      id: "tx-scaled-gbp",
      accountId: "acc-gbp-main",
      amount: {
        value: {
          unscaledValue: "-2599",
          scale: "2"
        },
        currencyCode: "GBP"
      },
      descriptions: {
        display: "Tesco"
      },
      dates: {
        booked: "2026-05-04"
      },
      status: "BOOKED"
    }
  ]);

  assert.equal(result.skippedCount, 0);
  assert.equal(result.transactions.length, 1);
  const tx = result.transactions[0];
  assert.equal(tx.amount, -25.99);
  assert.equal(tx.currency, "GBP");
  assert.equal(tx.type, "expense");
});

for (const testScenario of scenarios) {
  testScenario.run();
  console.log(`ok - ${testScenario.name}`);
}

console.log(`${scenarios.length} Tink aggregation scenarios passed`);
