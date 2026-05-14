import type { Account, Transaction } from "../data/types";
import { buildStaticSnapshot } from "../services/fxRates";
import { getAccountBalanceReconciliations, getCurrencyExposure, getDashboardSummary } from "./finance";

const eurSnapshot = buildStaticSnapshot("EUR", 0);
const hufSnapshot = buildStaticSnapshot("HUF", 0);

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
    providerAccountId: "provider-forint",
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
        isBalanced: true,
        isProviderSnapshot: true,
        needsReconciliation: false
      })
    ]);
  });

  it("does not flag provider balance snapshots when imported history is partial", () => {
    const [providerReconciliation] = getAccountBalanceReconciliations(
      [
        {
          id: "provider-bank",
          source: "local_bank",
          providerAccountId: "provider-bank",
          name: "Provider bank",
          currency: "EUR",
          type: "checking",
          currentBalance: 500
        }
      ],
      [
        {
          id: "recent-transaction",
          accountId: "provider-bank",
          source: "local_bank",
          postedAt: "2026-05-03",
          amount: -25,
          currency: "EUR",
          baseCurrencyAmount: -25,
          description: "Recent card payment",
          merchant: "Shop",
          category: "Shopping",
          type: "expense",
          isRecurring: false,
          isExcludedFromReports: false,
          dedupeHash: "recent-transaction"
        }
      ]
    );

    expect(providerReconciliation).toEqual(
      expect.objectContaining({
        computedBalance: -25,
        difference: 525,
        isBalanced: false,
        isProviderSnapshot: true,
        needsReconciliation: false
      })
    );
  });

  it("keeps matched transfers out of dashboard spending and income", () => {
    expect(getDashboardSummary(accounts, transactions, [], eurSnapshot)).toMatchObject({
      income: 100,
      expenses: 25,
      cashFlow: 75
    });
  });

  it("rescales dashboard sums into the snapshot base currency", () => {
    const hufSummary = getDashboardSummary(accounts, transactions, [], hufSnapshot);
    // EUR-stored income (100) divided by EUR-per-HUF (≈0.00254) ≈ 39 370 HUF.
    expect(hufSummary.income).toBeCloseTo(100 / hufSnapshot.rates.EUR, 1);
    expect(hufSummary.expenses).toBeCloseTo(25 / hufSnapshot.rates.EUR, 1);
  });

  it("exposes per-account base amounts using the snapshot", () => {
    const exposure = getCurrencyExposure(accounts, eurSnapshot);
    expect(exposure).toEqual([
      { currency: "EUR", amount: 75, baseAmount: 75 },
      expect.objectContaining({ currency: "HUF", amount: 1001 })
    ]);
    // 1001 HUF / 393.7 HUF-per-EUR ≈ 2.5425.
    expect(exposure[1]?.baseAmount).toBeCloseTo(1001 / eurSnapshot.rates.HUF, 4);
  });
});
