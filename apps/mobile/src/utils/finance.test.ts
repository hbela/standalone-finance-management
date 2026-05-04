import type { Account, Transaction } from "../data/types";
import { getAccountBalanceReconciliations, getDashboardSummary } from "./finance";

const accounts: Account[] = [
  {
    id: "checking",
    source: "manual",
    name: "Checking",
    currency: "EUR",
    type: "checking",
    currentBalance: 75
  },
  {
    id: "forint",
    source: "local_bank",
    name: "Forint",
    currency: "HUF",
    type: "checking",
    currentBalance: 1001
  }
];

const transactions: Transaction[] = [
  {
    id: "income",
    accountId: "checking",
    source: "manual",
    postedAt: "2026-05-01",
    amount: 100,
    currency: "EUR",
    baseCurrencyAmount: 100,
    description: "Invoice",
    merchant: "Client",
    category: "Freelance",
    type: "income",
    isRecurring: true,
    isExcludedFromReports: false,
    dedupeHash: "income"
  },
  {
    id: "expense",
    accountId: "checking",
    source: "manual",
    postedAt: "2026-05-02",
    amount: -25,
    currency: "EUR",
    baseCurrencyAmount: -25,
    description: "Groceries",
    merchant: "Market",
    category: "Food",
    type: "expense",
    isRecurring: false,
    isExcludedFromReports: false,
    dedupeHash: "expense"
  },
  {
    id: "transfer",
    accountId: "forint",
    source: "local_bank",
    postedAt: "2026-05-03",
    amount: 1000,
    currency: "HUF",
    baseCurrencyAmount: 2.54,
    description: "Internal move",
    merchant: "Savings",
    category: "Internal transfer",
    type: "transfer",
    isRecurring: false,
    isExcludedFromReports: true,
    dedupeHash: "transfer"
  }
];

describe("finance data quality", () => {
  it("reconciles account balances with currency-specific tolerances", () => {
    expect(getAccountBalanceReconciliations(accounts, transactions)).toEqual([
      expect.objectContaining({
        computedBalance: 75,
        difference: 0,
        transactionCount: 2,
        isBalanced: true
      }),
      expect.objectContaining({
        computedBalance: 1000,
        difference: 1,
        transactionCount: 1,
        isBalanced: true
      })
    ]);
  });

  it("keeps matched transfers out of dashboard spending and income", () => {
    expect(getDashboardSummary(accounts, transactions, [])).toMatchObject({
      income: 100,
      expenses: 25,
      cashFlow: 75
    });
  });
});
