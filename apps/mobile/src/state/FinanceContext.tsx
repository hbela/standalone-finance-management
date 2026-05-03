import React, { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { api } from "../convexApi";
import { accounts as initialAccounts, liabilities as initialLiabilities, transactions as initialTransactions } from "../data/mockFinance";
import type { Account, Currency, Liability, Transaction, TransactionType } from "../data/types";
import { createTransactionDedupeHash, type ParsedCsvTransaction, toImportedTransaction } from "../utils/csvImport";
import { toBaseCurrency } from "../utils/finance";

export type NewAccountInput = {
  name: string;
  source: Account["source"];
  currency: Currency;
  type: Account["type"];
  currentBalance: number;
  bankId?: string;
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

export type UpdateTransactionInput = {
  id: string;
  category: string;
  type: TransactionType;
  merchant: string;
  description: string;
  notes?: string;
  isRecurring: boolean;
  isExcludedFromReports: boolean;
};

type FinanceContextValue = {
  accounts: Account[];
  transactions: Transaction[];
  liabilities: Liability[];
  isPersisted: boolean;
  isLoading: boolean;
  addAccount: (input: NewAccountInput) => void;
  addTransaction: (input: NewTransactionInput) => void;
  importTransactions: (accountId: string, rows: ParsedCsvTransaction[]) => { imported: number; skipped: number };
  updateTransaction: (input: UpdateTransactionInput) => void;
  addLiability: (input: NewLiabilityInput) => void;
};

const FinanceContext = createContext<FinanceContextValue | null>(null);
type ConvexAccount = Doc<"accounts">;
type ConvexTransaction = Doc<"transactions">;
type ConvexLiability = Doc<"liabilities">;

export function FinanceProvider({
  children,
  persistWithConvex = false
}: {
  children: ReactNode;
  persistWithConvex?: boolean;
}) {
  if (persistWithConvex) {
    return <PersistentFinanceProvider>{children}</PersistentFinanceProvider>;
  }

  return <LocalFinanceProvider>{children}</LocalFinanceProvider>;
}

function LocalFinanceProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [liabilities, setLiabilities] = useState<Liability[]>(initialLiabilities);

  const value = useMemo<FinanceContextValue>(
    () => ({
      accounts,
      transactions,
      liabilities,
      isPersisted: false,
      isLoading: false,
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
          isExcludedFromReports: input.type === "transfer",
          dedupeHash: createTransactionDedupeHash({
            accountId: account.id,
            postedAt: input.postedAt,
            amount: signedAmount,
            currency: account.currency,
            description: input.description,
            merchant: input.merchant
          })
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
      importTransactions: (accountId, rows) => {
        const account = accounts.find((candidate) => candidate.id === accountId);
        if (!account) {
          return { imported: 0, skipped: rows.length };
        }

        const existingHashes = new Set(transactions.map((transaction) => transaction.dedupeHash));
        const importedTransactions = rows
          .filter((row) => {
            if (existingHashes.has(row.dedupeHash)) {
              return false;
            }
            existingHashes.add(row.dedupeHash);
            return true;
          })
          .map((row) => toImportedTransaction(row, account));
        const balanceDelta = importedTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);

        if (importedTransactions.length === 0) {
          return { imported: 0, skipped: rows.length };
        }

        setTransactions((current) => [...importedTransactions, ...current]);
        setAccounts((current) =>
          current.map((candidate) =>
            candidate.id === account.id
              ? {
                  ...candidate,
                  currentBalance: candidate.currentBalance + balanceDelta,
                  lastSyncedAt: "CSV import today"
                }
              : candidate
          )
        );

        return {
          imported: importedTransactions.length,
          skipped: rows.length - importedTransactions.length
        };
      },
      updateTransaction: (input) => {
        setTransactions((current) =>
          current.map((transaction) =>
            transaction.id === input.id
              ? {
                  ...transaction,
                  category: input.category,
                  type: input.type,
                  merchant: input.merchant,
                  description: input.description,
                  notes: input.notes,
                  isRecurring: input.isRecurring,
                  isExcludedFromReports: input.isExcludedFromReports
                }
              : transaction
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

function PersistentFinanceProvider({ children }: { children: ReactNode }) {
  const convexAccounts = useQuery(api.accounts.listForCurrent);
  const convexTransactions = useQuery(api.transactions.listForCurrent);
  const convexLiabilities = useQuery(api.liabilities.listForCurrent);
  const createAccount = useMutation(api.accounts.createManual);
  const createTransaction = useMutation(api.transactions.createManual);
  const importConvexTransactions = useMutation(api.transactions.importForAccount);
  const updateConvexTransaction = useMutation(api.transactions.update);
  const createLiability = useMutation(api.liabilities.createManual);
  const isLoading =
    convexAccounts === undefined || convexTransactions === undefined || convexLiabilities === undefined;

  const accounts = useMemo<Account[]>(
    () =>
      ((convexAccounts ?? []) as ConvexAccount[]).map((account) => ({
        id: account._id,
        source: account.source,
        bankId: account.bankKey,
        name: account.name,
        currency: account.currency,
        type: account.type,
        currentBalance: account.currentBalance,
        lastSyncedAt: account.lastSyncedAt ? formatSyncLabel(account.lastSyncedAt) : undefined
      })),
    [convexAccounts]
  );

  const transactions = useMemo<Transaction[]>(
    () =>
      ((convexTransactions ?? []) as ConvexTransaction[])
        .map((transaction) => ({
          id: transaction._id,
          accountId: transaction.accountId,
          source: transaction.source,
          postedAt: new Date(transaction.postedAt).toISOString().slice(0, 10),
          amount: transaction.amount,
          currency: transaction.currency,
          baseCurrencyAmount: transaction.baseCurrencyAmount ?? toBaseCurrency(transaction.amount, transaction.currency),
          description: transaction.description,
          merchant: transaction.merchant ?? transaction.description,
          category: transaction.categoryId ?? "Other",
          type: transaction.type,
          isRecurring: transaction.isRecurring,
          isExcludedFromReports: transaction.isExcludedFromReports,
          dedupeHash: transaction.dedupeHash,
          notes: transaction.notes
        }))
        .sort((left, right) => right.postedAt.localeCompare(left.postedAt)),
    [convexTransactions]
  );

  const liabilities = useMemo<Liability[]>(
    () =>
      ((convexLiabilities ?? []) as ConvexLiability[])
        .map((liability) => ({
          id: liability._id,
          name: liability.name,
          institution: liability.institution,
          type: liability.type,
          currency: liability.currency,
          originalPrincipal: liability.originalPrincipal,
          outstandingBalance: liability.outstandingBalance,
          interestRate: liability.interestRate,
          paymentAmount: liability.paymentAmount,
          paymentFrequency: liability.paymentFrequency,
          nextDueDate: liability.nextDueDate,
          rateType: liability.rateType
        }))
        .sort((left, right) => left.nextDueDate.localeCompare(right.nextDueDate)),
    [convexLiabilities]
  );

  const value = useMemo<FinanceContextValue>(
    () => ({
      accounts,
      transactions,
      liabilities,
      isPersisted: true,
      isLoading,
      addAccount: (input) => {
        void createAccount({
          source: input.source,
          bankKey: input.bankId,
          name: input.name,
          currency: input.currency,
          type: input.type,
          currentBalance: input.currentBalance
        });
      },
      addTransaction: (input) => {
        const account = accounts.find((candidate) => candidate.id === input.accountId);
        if (!account) {
          return;
        }

        const signedAmount = normalizeAmount(input.amount, input.type);
        void createTransaction({
          accountId: account.id as Id<"accounts">,
          source: account.source,
          postedAt: Date.parse(input.postedAt),
          amount: signedAmount,
          currency: account.currency,
          baseCurrencyAmount: toBaseCurrency(signedAmount, account.currency),
          description: input.description,
          merchant: input.merchant,
          categoryId: input.category,
          type: input.type,
          isRecurring: input.isRecurring,
          isExcludedFromReports: input.type === "transfer",
          dedupeHash: createTransactionDedupeHash({
            accountId: account.id,
            postedAt: input.postedAt,
            amount: signedAmount,
            currency: account.currency,
            description: input.description,
            merchant: input.merchant
          })
        });
      },
      importTransactions: (accountId, rows) => {
        const account = accounts.find((candidate) => candidate.id === accountId);
        if (!account) {
          return { imported: 0, skipped: rows.length };
        }

        void importConvexTransactions({
          transactions: rows.map((row) => ({
            accountId: account.id as Id<"accounts">,
            source: account.source,
            postedAt: Date.parse(row.postedAt),
            amount: row.amount,
            currency: row.currency,
            baseCurrencyAmount: toBaseCurrency(row.amount, row.currency),
            description: row.description,
            merchant: row.merchant,
            categoryId: row.category,
            type: row.type,
            isRecurring: false,
            isExcludedFromReports: row.type === "transfer",
            dedupeHash: row.dedupeHash,
            notes: "Imported from CSV"
          }))
        });

        return { imported: rows.length, skipped: 0 };
      },
      updateTransaction: (input) => {
        void updateConvexTransaction({
          transactionId: input.id as Id<"transactions">,
          categoryId: input.category,
          type: input.type,
          merchant: input.merchant,
          description: input.description,
          notes: input.notes,
          isRecurring: input.isRecurring,
          isExcludedFromReports: input.isExcludedFromReports
        });
      },
      addLiability: (input) => {
        void createLiability({
          name: input.name,
          institution: input.institution,
          type: input.type,
          currency: input.currency,
          originalPrincipal: input.originalPrincipal,
          outstandingBalance: input.outstandingBalance,
          interestRate: input.interestRate,
          paymentAmount: input.paymentAmount,
          paymentFrequency: "monthly",
          nextDueDate: input.nextDueDate,
          rateType: input.rateType
        });
      }
    }),
    [
      accounts,
      createAccount,
      createLiability,
      createTransaction,
      importConvexTransactions,
      isLoading,
      liabilities,
      transactions,
      updateConvexTransaction
    ]
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

function formatSyncLabel(timestamp: number) {
  return `Synced ${new Date(timestamp).toLocaleDateString()}`;
}
