import React, { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { api } from "../convexApi";
import { defaultCategories } from "../data/categories";
import { accounts as initialAccounts, liabilities as initialLiabilities, transactions as initialTransactions } from "../data/mockFinance";
import type { Account, Category, Currency, ImportBatch, Liability, Transaction, TransactionType } from "../data/types";
import {
  arePotentialDuplicateTransactions,
  createTransactionDedupeHash,
  type DedupeTransaction,
  type ParsedCsvTransaction,
  toImportedTransaction
} from "../utils/csvImport";
import { toBaseCurrency } from "../utils/finance";

export type NewAccountInput = {
  name: string;
  source: Account["source"];
  currency: Currency;
  type: Account["type"];
  currentBalance: number;
  bankId?: string;
};

export type UpdateAccountInput = NewAccountInput & {
  id: string;
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

export type UpdateLiabilityInput = NewLiabilityInput & {
  id: string;
  paymentFrequency: Liability["paymentFrequency"];
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
  transferMatchId?: string | null;
};

type FinanceContextValue = {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  liabilities: Liability[];
  importBatches: ImportBatch[];
  settings: {
    baseCurrency: Currency;
    locale: string;
  };
  isPersisted: boolean;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  addAccount: (input: NewAccountInput) => Promise<void>;
  updateAccount: (input: UpdateAccountInput) => Promise<void>;
  archiveAccount: (accountId: string) => Promise<void>;
  addCategory: (name: string) => Promise<void>;
  archiveCategory: (name: string) => Promise<void>;
  addTransaction: (input: NewTransactionInput) => Promise<void>;
  importTransactions: (
    accountId: string,
    rows: ParsedCsvTransaction[],
    metadata?: {
      rowCount: number;
      columnMapping: Record<string, string>;
      dateFormat: string;
      sourceName?: string;
    }
  ) => Promise<{ imported: number; skipped: number; batchId?: string }>;
  updateTransaction: (input: UpdateTransactionInput) => Promise<void>;
  archiveTransaction: (transactionId: string) => Promise<void>;
  revertImportBatch: (importBatchId: string) => Promise<void>;
  addLiability: (input: NewLiabilityInput) => Promise<void>;
  updateLiability: (input: UpdateLiabilityInput) => Promise<void>;
  archiveLiability: (liabilityId: string) => Promise<void>;
  updateSettings: (input: { baseCurrency: Currency; locale: string }) => Promise<void>;
};

const FinanceContext = createContext<FinanceContextValue | null>(null);
type ConvexAccount = Doc<"accounts">;
type ConvexCategory = Doc<"categories">;
type ConvexTransaction = Doc<"transactions">;
type ConvexLiability = Doc<"liabilities">;
type ConvexImportBatch = Doc<"importBatches">;

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
  const [categories, setCategories] = useState<Category[]>(defaultCategories);
  const [settings, setSettings] = useState<{ baseCurrency: Currency; locale: string }>({
    baseCurrency: "EUR",
    locale: "en-US"
  });
  const [error, setError] = useState<string | null>(null);

  const value = useMemo<FinanceContextValue>(
    () => ({
      accounts,
      categories,
      transactions,
      liabilities,
      importBatches: [],
      settings,
      isPersisted: false,
      isLoading: false,
      error,
      clearError: () => setError(null),
      addAccount: async (input) => {
        const account: Account = {
          id: `account-${Date.now()}`,
          ...input,
          lastSyncedAt: "Added manually"
        };
        setAccounts((current) => [account, ...current]);
      },
      updateAccount: async (input) => {
        setAccounts((current) =>
          current.map((account) =>
            account.id === input.id
              ? {
                  id: account.id,
                  name: input.name,
                  source: input.source,
                  currency: input.currency,
                  type: input.type,
                  currentBalance: input.currentBalance,
                  bankId: input.bankId,
                  lastSyncedAt: account.lastSyncedAt
                }
              : account
          )
        );
      },
      archiveAccount: async (accountId) => {
        setAccounts((current) => current.filter((account) => account.id !== accountId));
        setTransactions((current) => current.filter((transaction) => transaction.accountId !== accountId));
      },
      addCategory: async (name) => {
        const normalizedName = normalizeCategoryName(name);
        if (normalizedName.length === 0) {
          return;
        }
        setCategories((current) => {
          if (current.some((category) => normalizeCategoryName(category.name) === normalizedName)) {
            return current;
          }
          const displayName = name.trim().replace(/\s+/g, " ");
          return [...current, { id: displayName, name: displayName, isDefault: false }];
        });
      },
      archiveCategory: async (name) => {
        const normalizedName = normalizeCategoryName(name);
        if (transactions.some((transaction) => normalizeCategoryName(transaction.category) === normalizedName)) {
          setError("Category is used by active transactions");
          return;
        }
        setCategories((current) =>
          current.filter((category) => category.isDefault || normalizeCategoryName(category.name) !== normalizedName)
        );
      },
      addTransaction: async (input) => {
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
          transferMatchId: undefined,
          dedupeHash: createTransactionDedupeHash({
            accountId: account.id,
            postedAt: input.postedAt,
            amount: signedAmount,
            currency: account.currency,
            description: input.description,
            merchant: input.merchant
          })
        };

        if (transactions.some((candidate) => arePotentialDuplicateTransactions(candidate, transaction))) {
          return;
        }

        setTransactions((current) => [transaction, ...current]);
        setAccounts((current) =>
          current.map((candidate) =>
            candidate.id === account.id
              ? { ...candidate, currentBalance: candidate.currentBalance + signedAmount }
              : candidate
          )
        );
      },
      importTransactions: async (accountId, rows) => {
        const account = accounts.find((candidate) => candidate.id === accountId);
        if (!account) {
          return { imported: 0, skipped: rows.length };
        }

        const dedupeCandidates: DedupeTransaction[] = [...transactions];
        const importedTransactions = rows
          .filter((row) => {
            const candidate = { ...row, accountId };
            if (dedupeCandidates.some((existing) => arePotentialDuplicateTransactions(existing, candidate))) {
              return false;
            }
            dedupeCandidates.push(candidate);
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
      updateTransaction: async (input) => {
        setTransactions((current) =>
          current.map((transaction) =>
            transaction.id === input.id
              ? {
                  ...transaction,
                  category: input.transferMatchId ? "Internal transfer" : input.category,
                  type: input.transferMatchId ? "transfer" : input.type,
                  merchant: input.merchant,
                  description: input.description,
                  notes: input.notes,
                  isRecurring: input.isRecurring,
                  isExcludedFromReports: input.transferMatchId ? true : input.isExcludedFromReports,
                  transferMatchId: input.transferMatchId ?? undefined
                }
              : input.transferMatchId && transaction.id === input.transferMatchId
                ? {
                    ...transaction,
                    category: "Internal transfer",
                    type: "transfer",
                    isExcludedFromReports: true,
                    transferMatchId: input.id
                  }
                : transaction.transferMatchId === input.id && transaction.id !== input.transferMatchId
                  ? { ...transaction, transferMatchId: undefined }
              : transaction
          )
        );
      },
      archiveTransaction: async (transactionId) => {
        const transaction = transactions.find((candidate) => candidate.id === transactionId);
        setTransactions((current) => current.filter((candidate) => candidate.id !== transactionId));
        if (transaction) {
          setAccounts((current) =>
            current.map((account) =>
              account.id === transaction.accountId
                ? { ...account, currentBalance: account.currentBalance - transaction.amount }
                : account
            )
          );
        }
      },
      revertImportBatch: async () => {},
      addLiability: async (input) => {
        const liability: Liability = {
          id: `liability-${Date.now()}`,
          ...input,
          paymentFrequency: "monthly"
        };
        setLiabilities((current) => [liability, ...current]);
      },
      updateLiability: async (input) => {
        setLiabilities((current) =>
          current.map((liability) =>
            liability.id === input.id
              ? {
                  id: liability.id,
                  name: input.name,
                  institution: input.institution,
                  type: input.type,
                  currency: input.currency,
                  originalPrincipal: input.originalPrincipal,
                  outstandingBalance: input.outstandingBalance,
                  interestRate: input.interestRate,
                  paymentAmount: input.paymentAmount,
                  paymentFrequency: input.paymentFrequency,
                  nextDueDate: input.nextDueDate,
                  rateType: input.rateType
                }
              : liability
          )
        );
      },
      archiveLiability: async (liabilityId) => {
        setLiabilities((current) => current.filter((liability) => liability.id !== liabilityId));
      },
      updateSettings: async (input) => {
        setSettings(input);
      }
    }),
    [accounts, categories, error, liabilities, settings, transactions]
  );

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

function PersistentFinanceProvider({ children }: { children: ReactNode }) {
  const convexAccounts = useQuery(api.accounts.listForCurrent);
  const convexCategories = useQuery(api.categories.listForCurrent);
  const convexTransactions = useQuery(api.transactions.listForCurrent);
  const convexLiabilities = useQuery(api.liabilities.listForCurrent);
  const convexImportBatches = useQuery(api.importBatches.listForCurrent);
  const convexUser = useQuery(api.users.current);
  const createAccount = useMutation(api.accounts.createManual);
  const updateConvexAccount = useMutation(api.accounts.update);
  const archiveConvexAccount = useMutation(api.accounts.archive);
  const createConvexCategory = useMutation(api.categories.create);
  const archiveConvexCategory = useMutation(api.categories.archive);
  const createTransaction = useMutation(api.transactions.createManual);
  const importConvexTransactions = useMutation(api.transactions.importForAccount);
  const updateConvexTransaction = useMutation(api.transactions.update);
  const archiveConvexTransaction = useMutation(api.transactions.archive);
  const revertConvexImportBatch = useMutation(api.importBatches.revert);
  const createLiability = useMutation(api.liabilities.createManual);
  const updateConvexLiability = useMutation(api.liabilities.update);
  const archiveConvexLiability = useMutation(api.liabilities.archive);
  const updateConvexUser = useMutation(api.users.upsertCurrent);
  const [error, setError] = useState<string | null>(null);
  const isLoading =
    convexAccounts === undefined ||
    convexCategories === undefined ||
    convexTransactions === undefined ||
    convexLiabilities === undefined ||
    convexImportBatches === undefined ||
    convexUser === undefined;

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
          transferMatchId: transaction.transferMatchId,
          dedupeHash: transaction.dedupeHash,
          notes: transaction.notes
        }))
        .sort((left, right) => right.postedAt.localeCompare(left.postedAt)),
    [convexTransactions]
  );

  const categories = useMemo<Category[]>(
    () =>
      convexCategories === undefined
        ? defaultCategories
        : ((convexCategories ?? []) as Array<ConvexCategory | Category>).map((category) => ({
            id: "id" in category ? category.id : category.name,
            name: category.name,
            isDefault: "isDefault" in category ? category.isDefault : false
          })),
    [convexCategories]
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

  const importBatches = useMemo<ImportBatch[]>(
    () =>
      ((convexImportBatches ?? []) as ConvexImportBatch[])
        .map((importBatch) => ({
          id: importBatch._id,
          accountId: importBatch.accountId,
          source: importBatch.source,
          status: importBatch.status,
          sourceName: importBatch.sourceName,
          rowCount: importBatch.rowCount,
          importedCount: importBatch.importedCount,
          skippedCount: importBatch.skippedCount,
          columnMapping: importBatch.columnMapping,
          dateFormat: importBatch.dateFormat,
          createdAt: new Date(importBatch.createdAt).toISOString()
        }))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [convexImportBatches]
  );

  const settings = useMemo(
    () => ({
      baseCurrency: (convexUser?.baseCurrency ?? "EUR") as Currency,
      locale: convexUser?.locale ?? "en-US"
    }),
    [convexUser]
  );

  const value = useMemo<FinanceContextValue>(
    () => ({
      accounts,
      categories,
      transactions,
      liabilities,
      importBatches,
      settings,
      isPersisted: true,
      isLoading,
      error,
      clearError: () => setError(null),
      addAccount: async (input) => {
        await runMutation(setError, () =>
          createAccount({
            source: input.source,
            bankKey: input.bankId,
            name: input.name,
            currency: input.currency,
            type: input.type,
            currentBalance: input.currentBalance
          })
        );
      },
      updateAccount: async (input) => {
        await runMutation(setError, () =>
          updateConvexAccount({
            accountId: input.id as Id<"accounts">,
            source: input.source,
            bankKey: input.bankId,
            name: input.name,
            currency: input.currency,
            type: input.type,
            currentBalance: input.currentBalance
          })
        );
      },
      archiveAccount: async (accountId) => {
        await runMutation(setError, () => archiveConvexAccount({ accountId: accountId as Id<"accounts"> }));
      },
      addCategory: async (name) => {
        await runMutation(setError, () => createConvexCategory({ name }));
      },
      archiveCategory: async (name) => {
        await runMutation(setError, () => archiveConvexCategory({ name }));
      },
      addTransaction: async (input) => {
        const account = accounts.find((candidate) => candidate.id === input.accountId);
        if (!account) {
          return;
        }

        const signedAmount = normalizeAmount(input.amount, input.type);
        await runMutation(setError, () =>
          createTransaction({
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
            transferMatchId: undefined,
            dedupeHash: createTransactionDedupeHash({
              accountId: account.id,
              postedAt: input.postedAt,
              amount: signedAmount,
              currency: account.currency,
              description: input.description,
              merchant: input.merchant
            })
          })
        );
      },
      importTransactions: async (accountId, rows, metadata) => {
        const account = accounts.find((candidate) => candidate.id === accountId);
        if (!account) {
          return { imported: 0, skipped: rows.length };
        }

        return await runMutation(setError, () =>
          importConvexTransactions({
            accountId: account.id as Id<"accounts">,
            sourceName: metadata?.sourceName,
            rowCount: metadata?.rowCount ?? rows.length,
            columnMapping: metadata?.columnMapping ?? {},
            dateFormat: metadata?.dateFormat ?? "auto",
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
          })
        );
      },
      updateTransaction: async (input) => {
        await runMutation(setError, () =>
          updateConvexTransaction({
            transactionId: input.id as Id<"transactions">,
            categoryId: input.category,
            type: input.type,
            merchant: input.merchant,
            description: input.description,
            notes: input.notes,
            isRecurring: input.isRecurring,
            isExcludedFromReports: input.isExcludedFromReports,
            transferMatchId: input.transferMatchId === null ? null : (input.transferMatchId as Id<"transactions"> | undefined)
          })
        );
      },
      archiveTransaction: async (transactionId) => {
        await runMutation(setError, () => archiveConvexTransaction({ transactionId: transactionId as Id<"transactions"> }));
      },
      revertImportBatch: async (importBatchId) => {
        await runMutation(setError, () =>
          revertConvexImportBatch({ importBatchId: importBatchId as Id<"importBatches"> })
        );
      },
      addLiability: async (input) => {
        await runMutation(setError, () =>
          createLiability({
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
          })
        );
      },
      updateLiability: async (input) => {
        await runMutation(setError, () =>
          updateConvexLiability({
            liabilityId: input.id as Id<"liabilities">,
            name: input.name,
            institution: input.institution,
            type: input.type,
            currency: input.currency,
            originalPrincipal: input.originalPrincipal,
            outstandingBalance: input.outstandingBalance,
            interestRate: input.interestRate,
            paymentAmount: input.paymentAmount,
            paymentFrequency: input.paymentFrequency,
            nextDueDate: input.nextDueDate,
            rateType: input.rateType
          })
        );
      },
      archiveLiability: async (liabilityId) => {
        await runMutation(setError, () => archiveConvexLiability({ liabilityId: liabilityId as Id<"liabilities"> }));
      },
      updateSettings: async (input) => {
        await runMutation(setError, () =>
          updateConvexUser({
            country: "HU",
            locale: input.locale,
            baseCurrency: input.baseCurrency
          })
        );
      }
    }),
    [
      accounts,
      archiveConvexAccount,
      archiveConvexCategory,
      archiveConvexLiability,
      archiveConvexTransaction,
      createAccount,
      createConvexCategory,
      createLiability,
      createTransaction,
      error,
      importConvexTransactions,
      importBatches,
      isLoading,
      liabilities,
      categories,
      revertConvexImportBatch,
      settings,
      transactions,
      updateConvexAccount,
      updateConvexLiability,
      updateConvexUser,
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

function normalizeCategoryName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

async function runMutation<T>(setError: (message: string | null) => void, mutation: () => Promise<T>) {
  try {
    setError(null);
    return await mutation();
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Finance action failed";
    setError(message);
    throw caught;
  }
}
