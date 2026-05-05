import type { Account, Currency, Liability, Transaction } from "../data/types";

const eurRates: Record<Currency, number> = {
  EUR: 1,
  HUF: 0.00254,
  USD: 0.93,
  GBP: 1.16
};

export function toBaseCurrency(amount: number, currency: Currency): number {
  return amount * eurRates[currency];
}

export function getDashboardSummary(accounts: Account[], transactions: Transaction[], liabilities: Liability[]) {
  const reportableTransactions = transactions.filter((transaction) => !transaction.isExcludedFromReports);
  const cash = accounts.reduce(
    (sum, account) => sum + toBaseCurrency(account.currentBalance, account.currency),
    0
  );
  const debt = liabilities.reduce(
    (sum, liability) => sum + toBaseCurrency(liability.outstandingBalance, liability.currency),
    0
  );
  const income = reportableTransactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + transaction.baseCurrencyAmount, 0);
  const expenses = reportableTransactions
    .filter((transaction) => ["expense", "fee"].includes(transaction.type))
    .reduce((sum, transaction) => sum + Math.abs(transaction.baseCurrencyAmount), 0);
  const debtPayments = reportableTransactions
    .filter((transaction) => ["loan_payment", "mortgage_payment"].includes(transaction.type))
    .reduce((sum, transaction) => sum + Math.abs(transaction.baseCurrencyAmount), 0);

  return {
    cash,
    debt,
    netWorth: cash - debt,
    income,
    expenses,
    debtPayments,
    cashFlow: income - expenses - debtPayments
  };
}

export function getCurrencyExposure(accounts: Account[]) {
  return accounts.map((account) => ({
    currency: account.currency,
    amount: account.currentBalance,
    baseAmount: toBaseCurrency(account.currentBalance, account.currency)
  }));
}

export type AccountBalanceReconciliation = {
  account: Account;
  computedBalance: number;
  difference: number;
  transactionCount: number;
  isBalanced: boolean;
  isProviderSnapshot: boolean;
  needsReconciliation: boolean;
};

export function getAccountBalanceReconciliations(
  accounts: Account[],
  transactions: Transaction[]
): AccountBalanceReconciliation[] {
  const transactionsByAccount = transactions.reduce<Map<string, Transaction[]>>((groups, transaction) => {
    groups.set(transaction.accountId, [...(groups.get(transaction.accountId) ?? []), transaction]);
    return groups;
  }, new Map());

  return accounts.map((account) => {
    const accountTransactions = transactionsByAccount.get(account.id) ?? [];
    const computedBalance = accountTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
    const difference = account.currentBalance - computedBalance;
    const isProviderSnapshot = Boolean(account.providerAccountId);
    const isBalanced = Math.abs(difference) <= getBalanceTolerance(account.currency);

    return {
      account,
      computedBalance,
      difference,
      transactionCount: accountTransactions.length,
      isBalanced,
      isProviderSnapshot,
      needsReconciliation: !isProviderSnapshot && !isBalanced
    };
  });
}

function getBalanceTolerance(currency: Currency) {
  return currency === "HUF" ? 1 : 0.01;
}
