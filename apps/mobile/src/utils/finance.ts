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
  const cash = accounts.reduce(
    (sum, account) => sum + toBaseCurrency(account.currentBalance, account.currency),
    0
  );
  const debt = liabilities.reduce(
    (sum, liability) => sum + toBaseCurrency(liability.outstandingBalance, liability.currency),
    0
  );
  const income = transactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + transaction.baseCurrencyAmount, 0);
  const expenses = transactions
    .filter((transaction) => ["expense", "fee"].includes(transaction.type))
    .reduce((sum, transaction) => sum + Math.abs(transaction.baseCurrencyAmount), 0);
  const debtPayments = transactions
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
