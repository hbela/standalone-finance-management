import {
  accountIdByProviderId,
  NOW,
  tinkAccountsFixture,
  tinkTransactionsFixture,
} from "./tinkMockFixtures";
import {
  getDefaultTransactionWindow,
  normalizeTinkAccounts,
  normalizeTinkTransactions,
} from "./tinkNormalization";

describe("normalizeTinkAccounts", () => {
  test("imports supported account shapes and skips unsupported/malformed accounts", () => {
    const result = normalizeTinkAccounts(tinkAccountsFixture, NOW);

    expect(result.skippedCount).toBe(2);
    expect(result.accounts).toHaveLength(2);
    expect(result.accounts[0]).toMatchObject({
      id: "tink-account-gb-main-account-1",
      providerAccountId: "gb-main/account:1",
      bankId: "tink:demo-bank-uk",
      bankKey: "tink:demo-bank-uk",
      credentialsId: "cred-1",
      name: "Everyday GBP",
      currency: "GBP",
      type: "checking",
      currentBalance: 1234.56,
      availableBalance: 1200.25,
      holderName: "Ada Lovelace",
      iban: "GB29NWBK60161331926819",
      bban: "60161331926819",
      lastSyncedAt: NOW,
    });
    expect(result.accounts[1]).toMatchObject({
      id: "tink-account-eur-savings",
      name: "Euro Credit Union",
      currency: "EUR",
      type: "savings",
      currentBalance: 2500,
      holderName: "Grace Hopper",
      iban: "DE89370400440532013000",
      bban: "370400440532013000",
    });
  });

  test("maps account type variants", () => {
    const result = normalizeTinkAccounts(
      [
        { id: "credit", currencyCode: "USD", type: "creditCard" },
        { id: "mortgage", currencyCode: "HUF", type: "mortgage loan" },
        { id: "loan", currencyCode: "EUR", type: "consumer loan" },
      ],
      NOW
    );

    expect(result.accounts.map((account) => account.type)).toEqual([
      "credit",
      "mortgage",
      "loan",
    ]);
  });
});

describe("normalizeTinkTransactions", () => {
  test("imports transaction variants and classifies types/status/category", () => {
    const result = normalizeTinkTransactions(tinkTransactionsFixture, accountIdByProviderId, NOW);

    expect(result.transactions).toHaveLength(5);
    expect(result.skippedCount).toBe(6);
    expect(result.skipReasons).toEqual({
      missing_id: 1,
      missing_provider_account_id: 1,
      unknown_provider_account_id: 1,
      unparseable_amount: 1,
      "unsupported_currency:SEK": 1,
      unparseable_date: 1,
    });

    expect(result.transactions[0]).toMatchObject({
      id: "tink-transaction-tx-card",
      accountId: "tink-account-gb-main-account-1",
      amount: -12.99,
      currency: "GBP",
      description: "Card purchase",
      merchant: "Corner Shop",
      categoryId: "Food",
      tinkCategoryCode: "expenses:food.groceries",
      type: "expense",
      status: "booked",
    });
    expect(result.transactions[0].dedupeHash).toContain(
      "tink-account-gb-main-account-1|2026-05-10|-12.99|GBP"
    );

    expect(result.transactions[1]).toMatchObject({
      id: "tink-transaction-tx-pending",
      accountId: "tink-account-eur-savings",
      amount: 2500,
      currency: "EUR",
      merchant: "Salary May",
      categoryId: "Salary",
      type: "income",
      status: "pending",
    });
    expect(result.transactions[2]).toMatchObject({
      type: "transfer",
      description: "Move to savings",
      merchant: "Move to savings",
    });
    expect(result.transactions[3]).toMatchObject({ type: "refund" });
    expect(result.transactions[4]).toMatchObject({ type: "fee" });
  });

  test("falls back to Other category while preserving unknown Tink category code", () => {
    const result = normalizeTinkTransactions(
      [
        {
          id: "unknown-category",
          accountId: "gb-main/account:1",
          amount: -20,
          currencyCode: "GBP",
          description: "Mystery spend",
          category: "expenses:very.new.category",
          bookedDate: "2026-05-13",
        },
      ],
      accountIdByProviderId,
      NOW
    );

    expect(result.transactions[0]).toMatchObject({
      categoryId: "Other",
      tinkCategoryCode: "expenses:very.new.category",
    });
  });
});

describe("getDefaultTransactionWindow", () => {
  test("uses a two-year inclusive lookback ending today", () => {
    expect(getDefaultTransactionWindow(NOW)).toEqual({
      from: "2024-05-14",
      to: "2026-05-14",
    });
  });
});
