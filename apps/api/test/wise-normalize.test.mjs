import assert from "node:assert/strict";

import { normalizeWiseAccounts, normalizeWiseTransactions, wiseNormalizeInternals } from "../dist/wiseNormalize.js";

const { classifyTransactionType, parseWiseDate, normalizeCurrency, createWiseDedupeHash, pickDescription, pickMerchant } = wiseNormalizeInternals;

const scenarios = [];

function scenario(name, run) {
  scenarios.push({ name, run });
}

function fxSnapshot() {
  return {
    base: "EUR",
    rates: { EUR: 1, HUF: 1 / 0.00254, USD: 1 / 0.93, GBP: 1 / 1.16 },
    source: "static",
    fetchedAt: Date.now()
  };
}

scenario("normalizes a personal profile balance into a wise_balance account", () => {
  const result = normalizeWiseAccounts([
    {
      profile: {
        id: 12345,
        type: "PERSONAL",
        details: { firstName: "Béla", lastName: "Hajzer" }
      },
      balance: {
        id: 9001,
        currency: "EUR",
        amount: { value: 1234.56, currency: "EUR" },
        cashAmount: { value: 1100, currency: "EUR" },
        name: "Main"
      }
    }
  ]);

  assert.equal(result.skippedCount, 0);
  assert.equal(result.accounts.length, 1);
  const [account] = result.accounts;
  assert.equal(account.providerAccountId, "9001");
  assert.equal(account.bankKey, "wise:personal");
  assert.equal(account.currency, "EUR");
  assert.equal(account.type, "wise_balance");
  assert.equal(account.currentBalance, 1234.56);
  assert.equal(account.availableBalance, 1100);
  assert.equal(account.institutionName, "Wise");
  assert.equal(account.holderName, "Béla Hajzer");
  assert.match(account.name, /Wise EUR/);
});

scenario("uses business name for BUSINESS profiles and routes them to the business bankKey", () => {
  const result = normalizeWiseAccounts([
    {
      profile: { id: 22222, type: "BUSINESS", details: { businessName: "Elysand Co" } },
      balance: { id: 9100, currency: "GBP", amount: { value: 50, currency: "GBP" } }
    }
  ]);
  assert.equal(result.accounts.length, 1);
  assert.equal(result.accounts[0].bankKey, "wise:business");
  assert.equal(result.accounts[0].holderName, "Elysand Co");
});

scenario("skips balances with unsupported currency or unparseable amount", () => {
  const result = normalizeWiseAccounts([
    {
      profile: { id: 1, type: "PERSONAL", fullName: "Test User" },
      balance: { id: 1, currency: "CHF", amount: { value: 10, currency: "CHF" } }
    },
    {
      profile: { id: 1, type: "PERSONAL", fullName: "Test User" },
      balance: { id: 2, currency: "EUR", amount: { value: Number.NaN, currency: "EUR" } }
    }
  ]);
  assert.equal(result.skippedCount, 2);
  assert.equal(result.accounts.length, 0);
  assert.ok(Object.keys(result.skipReasons).length > 0);
});

scenario("normalizes a Wise statement transaction with stable dedupe hash", () => {
  const result = normalizeWiseTransactions(
    [
      {
        profile: { id: 1, type: "PERSONAL", fullName: "Test User" },
        balance: { id: 9001, currency: "EUR", amount: { value: 1000, currency: "EUR" } },
        transactions: [
          {
            date: "2026-04-15T10:00:00.000Z",
            type: "DEBIT",
            amount: { value: -25.5, currency: "EUR" },
            details: {
              type: "CARD",
              description: "Apple Store EUR",
              senderName: "Apple"
            },
            referenceNumber: "TRX-1"
          }
        ]
      }
    ],
    fxSnapshot()
  );
  assert.equal(result.skippedCount, 0);
  assert.equal(result.transactions.length, 1);
  const [tx] = result.transactions;
  assert.equal(tx.providerAccountId, "9001");
  assert.equal(tx.providerTransactionId, "TRX-1");
  assert.equal(tx.amount, -25.5);
  assert.equal(tx.currency, "EUR");
  assert.equal(tx.type, "expense");
  assert.equal(tx.merchant, "Apple");
  assert.equal(tx.description, "Apple Store EUR");
  assert.equal(tx.status, "booked");
  assert.match(tx.dedupeHash, /^wise\|9001\|2026-04-15\|-25\.50\|EUR\|/);
});

scenario("classifies fee, conversion, and refund transaction types", () => {
  assert.equal(classifyTransactionType({ details: { type: "FEE" } }, -1), "fee");
  assert.equal(classifyTransactionType({ details: { type: "CONVERSION" } }, -10), "transfer");
  assert.equal(classifyTransactionType({ details: { type: "TRANSFER" } }, 10), "transfer");
  assert.equal(classifyTransactionType({ details: { type: "REFUND" } }, 10), "refund");
  assert.equal(classifyTransactionType({ details: { type: "CARD" } }, -25), "expense");
  assert.equal(classifyTransactionType({ details: { type: "DEPOSIT" } }, 100), "income");
});

scenario("skips statement transactions missing reference, currency, amount, or date", () => {
  const result = normalizeWiseTransactions(
    [
      {
        profile: { id: 1, type: "PERSONAL", fullName: "Test" },
        balance: { id: 1, currency: "EUR", amount: { value: 0, currency: "EUR" } },
        transactions: [
          { date: "2026-04-15", amount: { value: -1, currency: "EUR" } },
          { date: "2026-04-15", amount: { value: -1, currency: "CHF" }, referenceNumber: "X" },
          { date: "not-a-date", amount: { value: -1, currency: "EUR" }, referenceNumber: "Y" },
          { date: "2026-04-15", amount: { value: Number.NaN, currency: "EUR" }, referenceNumber: "Z" }
        ]
      }
    ],
    fxSnapshot()
  );
  assert.equal(result.transactions.length, 0);
  assert.equal(result.skippedCount, 4);
});

scenario("falls back through description sources (details.description → paymentReference → details.type)", () => {
  assert.equal(pickDescription({ details: { description: "Foo" } }), "Foo");
  assert.equal(pickDescription({ details: { paymentReference: "Bar" } }), "Bar");
  assert.equal(pickDescription({ details: { type: "CARD" } }), "Wise card");
  assert.equal(pickDescription({}), "Wise transaction");
});

scenario("picks merchant from senderName then recipientName", () => {
  assert.equal(pickMerchant({ details: { senderName: "Alice" } }), "Alice");
  assert.equal(pickMerchant({ details: { recipientName: "Bob" } }), "Bob");
  assert.equal(pickMerchant({}), undefined);
});

scenario("dedupe hash format mirrors Tink's shape but uses the wise prefix", () => {
  const hash = createWiseDedupeHash("wise", {
    providerAccountId: "9001",
    postedAt: Date.parse("2026-04-15T00:00:00.000Z"),
    amount: -25.5,
    currency: "EUR",
    description: "Apple Store EUR",
    merchant: "Apple"
  });
  assert.equal(hash, "wise|9001|2026-04-15|-25.50|EUR|apple store eur|apple");
});

scenario("normalizeCurrency rejects non-supported currencies", () => {
  assert.equal(normalizeCurrency("EUR"), "EUR");
  assert.equal(normalizeCurrency("eur"), "EUR");
  assert.equal(normalizeCurrency("CHF"), null);
  assert.equal(normalizeCurrency(undefined), null);
});

scenario("parseWiseDate handles ISO strings and rejects garbage", () => {
  assert.equal(parseWiseDate("2026-04-15T10:00:00.000Z"), Date.parse("2026-04-15T10:00:00.000Z"));
  assert.equal(parseWiseDate("not-a-date"), null);
  assert.equal(parseWiseDate(undefined), null);
});

for (const testScenario of scenarios) {
  testScenario.run();
  console.log(`ok - ${testScenario.name}`);
}

console.log(`${scenarios.length} Wise normalize scenarios passed`);
