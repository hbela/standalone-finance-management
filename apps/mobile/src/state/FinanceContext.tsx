import React, { createContext, type ReactNode, useContext, useMemo, useState } from "react";

import { accounts as initialAccounts, liabilities as initialLiabilities, transactions as initialTransactions } from "../data/mockFinance";
import type { Account, Currency, Liability, Transaction, TransactionType } from "../data/types";
import { toBaseCurrency } from "../utils/finance";

export type NewAccountInput = {
  name: string;
  source: Account["source"];
  currency: Currency;
  type: Account["type"];
  currentBalance: number;
};

export type NewTransactionInput = {
  accountId: string;
  amount: number;
  description: string;
  merchant: string;
  category: string;
  type: TransactionType;
  postedAt: string;
  isRecurring: boolean;
};

export type NewLiabilityInput = {
  name: string;
  institution: string;
  type: Liability["type"];
  currency: Currency;
  originalPrincipal: number;
  outstandingBalance: number;
  interestRate: number;
  paymentAmount: number;
  nextDueDate: string;
  rateType: Liability["rateType"];
};

type FinanceContextValue = {
  accounts: Account[];
  transactions: Transaction[];
  liabilities: Liability[];
  addAccount: (input: NewAccountInput) => void;
  addTransaction: (input: NewTransactionInput) => void;
  addLiability: (input: NewLiabilityInput) => void;
};

const FinanceContext = createContext<FinanceContextValue | null>(null);

export function FinanceProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [liabilities, setLiabilities] = useState<Liability[]>(initialLiabilities);

  const value = useMemo<FinanceContextValue>(
    () => ({
      accounts,
      transactions,
      liabilities,
      addAccount: (input) => {
        const account: Account = {
          id: `account-${Date.now()}`,
          ...input,
          lastSyncedAt: "Added manually"
        };
        setAccounts((current) => [account, ...current]);
      },
      addTransaction: (input) => {
        const account = accounts.find((candidate) => candidate.id === input.accountId);
        if (!account) {
          return;
        }

        const signedAmount = normalizeAmount(input.amount, input.type);
        const transaction: Transaction = {
          id: `transaction-${Date.now()}`,
          accountId: account.id,
          source: account.source,
          postedAt: input.postedAt,
          amount: signedAmount,
          currency: account.currency,
          baseCurrencyAmount: toBaseCurrency(signedAmount, account.currency),
          description: input.description,
          merchant: input.merchant,
          category: input.category,
          type: input.type,
          isRecurring: input.isRecurring,
          isExcludedFromReports: false
        };

        setTransactions((current) => [transaction, ...current]);
        setAccounts((current) =>
          current.map((candidate) =>
            candidate.id === account.id
              ? { ...candidate, currentBalance: candidate.currentBalance + signedAmount }
              : candidate
          )
        );
      },
      addLiability: (input) => {
        const liability: Liability = {
          id: `liability-${Date.now()}`,
          ...input,
          paymentFrequency: "monthly"
        };
        setLiabilities((current) => [liability, ...current]);
      }
    }),
    [accounts, liabilities, transactions]
  );

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const value = useContext(FinanceContext);
  if (!value) {
    throw new Error("useFinance must be used inside FinanceProvider");
  }
  return value;
}

function normalizeAmount(amount: number, type: TransactionType) {
  if (["income", "refund"].includes(type)) {
    return Math.abs(amount);
  }
  if (type === "transfer") {
    return amount;
  }
  return -Math.abs(amount);
}
