import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { getCurrentUser, getOrCreateCurrentUser } from "./model";

const currencyCode = v.union(
  v.literal("HUF"),
  v.literal("EUR"),
  v.literal("USD"),
  v.literal("GBP")
);

const accountSource = v.union(
  v.literal("local_bank"),
  v.literal("wise"),
  v.literal("manual")
);

const transactionType = v.union(
  v.literal("expense"),
  v.literal("income"),
  v.literal("transfer"),
  v.literal("loan_payment"),
  v.literal("mortgage_payment"),
  v.literal("fee"),
  v.literal("refund")
);

const transactionInput = {
  accountId: v.id("accounts"),
  source: accountSource,
  postedAt: v.number(),
  amount: v.number(),
  currency: currencyCode,
  baseCurrencyAmount: v.number(),
  description: v.string(),
  merchant: v.optional(v.string()),
  categoryId: v.optional(v.string()),
  importBatchId: v.optional(v.id("importBatches")),
  type: transactionType,
  isRecurring: v.boolean(),
  isExcludedFromReports: v.boolean(),
  transferMatchId: v.optional(v.id("transactions")),
  dedupeHash: v.string(),
  notes: v.optional(v.string())
};

type ValidatableTransaction = {
  accountId: Id<"accounts">;
  postedAt: number;
  amount: number;
  currency: "HUF" | "EUR" | "USD" | "GBP";
  baseCurrencyAmount: number;
  description: string;
  merchant?: string;
  dedupeHash: string;
};

type DuplicateCandidate = ValidatableTransaction & {
  userId: Id<"users">;
  archivedAt?: number;
};

export const listForCurrent = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return [];
    }

    return await ctx.db
      .query("transactions")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("archivedAt"), undefined))
      .collect();
  }
});

export const createManual = mutation({
  args: transactionInput,
  handler: async (ctx, args) => {
    validateTransaction(args);

    const user = await getOrCreateCurrentUser(ctx);
    const account = await ctx.db.get(args.accountId);

    if (!account || account.userId !== user._id || account.archivedAt) {
      throw new Error("Account not found");
    }

    const duplicate = await findDuplicate(ctx, user._id, args);
    if (duplicate) {
      return duplicate._id;
    }

    const now = Date.now();
    const transactionId = await ctx.db.insert("transactions", {
      userId: user._id,
      ...args,
      createdAt: now,
      updatedAt: now
    });

    await ctx.db.patch(account._id, {
      currentBalance: account.currentBalance + args.amount,
      updatedAt: now
    });

    return transactionId;
  }
});

export const importForAccount = mutation({
  args: {
    accountId: v.id("accounts"),
    sourceName: v.optional(v.string()),
    rowCount: v.number(),
    columnMapping: v.record(v.string(), v.string()),
    dateFormat: v.string(),
    transactions: v.array(v.object(transactionInput))
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    const importAccount = await ctx.db.get(args.accountId);

    if (!importAccount || importAccount.userId !== user._id || importAccount.archivedAt) {
      throw new Error("Account not found");
    }

    const now = Date.now();
    const importBatchId = await ctx.db.insert("importBatches", {
      userId: user._id,
      accountId: importAccount._id,
      source: "csv",
      status: "completed",
      sourceName: args.sourceName,
      rowCount: args.rowCount,
      importedCount: 0,
      skippedCount: 0,
      columnMapping: args.columnMapping,
      dateFormat: args.dateFormat,
      createdAt: now,
      updatedAt: now
    });
    const seen = new Set<string>();
    const acceptedTransactions: ValidatableTransaction[] = [];
    let imported = 0;
    let skipped = 0;
    const balanceDeltas = new Map<Id<"accounts">, number>();

    for (const transaction of args.transactions) {
      if (transaction.accountId !== args.accountId) {
        skipped += 1;
        continue;
      }

      if (!isValidTransaction(transaction)) {
        skipped += 1;
        continue;
      }

      if (seen.has(transaction.dedupeHash)) {
        skipped += 1;
        continue;
      }

      const account = await ctx.db.get(transaction.accountId);
      if (!account || account.userId !== user._id || account.archivedAt) {
        skipped += 1;
        continue;
      }

      if (acceptedTransactions.some((accepted) => arePotentialDuplicates(accepted, transaction))) {
        skipped += 1;
        continue;
      }

      const duplicate = await findDuplicate(ctx, user._id, transaction);
      if (duplicate) {
        skipped += 1;
        continue;
      }

      seen.add(transaction.dedupeHash);
      acceptedTransactions.push(transaction);
      const now = Date.now();
      await ctx.db.insert("transactions", {
        userId: user._id,
        ...transaction,
        importBatchId,
        createdAt: now,
        updatedAt: now
      });
      balanceDeltas.set(
        transaction.accountId,
        (balanceDeltas.get(transaction.accountId) ?? 0) + transaction.amount
      );
      imported += 1;
    }

    for (const [accountId, delta] of balanceDeltas.entries()) {
      const account = await ctx.db.get(accountId);
      if (account && account.userId === user._id) {
        await ctx.db.patch(account._id, {
          currentBalance: account.currentBalance + delta,
          lastSyncedAt: Date.now(),
          updatedAt: Date.now()
        });
      }
    }

    await ctx.db.patch(importBatchId, {
      importedCount: imported,
      skippedCount: skipped,
      updatedAt: Date.now()
    });

    return { imported, skipped, batchId: importBatchId };
  }
});

export const update = mutation({
  args: {
    transactionId: v.id("transactions"),
    categoryId: v.optional(v.string()),
    type: v.optional(transactionType),
    merchant: v.optional(v.string()),
    description: v.optional(v.string()),
    notes: v.optional(v.string()),
    isRecurring: v.optional(v.boolean()),
    isExcludedFromReports: v.optional(v.boolean()),
    transferMatchId: v.optional(v.union(v.id("transactions"), v.null()))
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    const transaction = await ctx.db.get(args.transactionId);

    if (!transaction || transaction.userId !== user._id || transaction.archivedAt) {
      throw new Error("Transaction not found");
    }

    let nextTransferMatchId = transaction.transferMatchId;
    if (args.transferMatchId !== undefined) {
      if (transaction.transferMatchId && transaction.transferMatchId !== args.transferMatchId) {
        const previousMatch = await ctx.db.get(transaction.transferMatchId);
        if (previousMatch && previousMatch.userId === user._id && previousMatch.transferMatchId === transaction._id) {
          await ctx.db.patch(previousMatch._id, {
            transferMatchId: undefined,
            updatedAt: Date.now()
          });
        }
      }

      if (args.transferMatchId === null) {
        nextTransferMatchId = undefined;
      } else {
        const match = await ctx.db.get(args.transferMatchId);
        if (!match || match.userId !== user._id || match.archivedAt) {
          throw new Error("Transfer match not found");
        }
        if (match._id === transaction._id || match.accountId === transaction.accountId) {
          throw new Error("Choose a transaction from another account");
        }

        if (match.transferMatchId && match.transferMatchId !== transaction._id) {
          const matchedPrevious = await ctx.db.get(match.transferMatchId);
          if (matchedPrevious && matchedPrevious.userId === user._id && matchedPrevious.transferMatchId === match._id) {
            await ctx.db.patch(matchedPrevious._id, {
              transferMatchId: undefined,
              updatedAt: Date.now()
            });
          }
        }

        nextTransferMatchId = match._id;
        await ctx.db.patch(match._id, {
          type: "transfer",
          categoryId: "Internal transfer",
          isExcludedFromReports: true,
          transferMatchId: transaction._id,
          updatedAt: Date.now()
        });
      }
    }

    const isMatchedTransfer = Boolean(nextTransferMatchId);
    await ctx.db.patch(args.transactionId, {
      categoryId: isMatchedTransfer ? "Internal transfer" : args.categoryId,
      type: isMatchedTransfer ? "transfer" : args.type,
      merchant: args.merchant,
      description: args.description,
      notes: args.notes,
      isRecurring: args.isRecurring,
      isExcludedFromReports: isMatchedTransfer ? true : args.isExcludedFromReports,
      transferMatchId: nextTransferMatchId,
      updatedAt: Date.now()
    });
  }
});

export const archive = mutation({
  args: {
    transactionId: v.id("transactions")
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    const transaction = await ctx.db.get(args.transactionId);

    if (!transaction || transaction.userId !== user._id || transaction.archivedAt) {
      throw new Error("Transaction not found");
    }

    const account = await ctx.db.get(transaction.accountId);
    const now = Date.now();

    await ctx.db.patch(args.transactionId, {
      archivedAt: now,
      updatedAt: now
    });

    if (account && account.userId === user._id && !account.archivedAt) {
      await ctx.db.patch(account._id, {
        currentBalance: account.currentBalance - transaction.amount,
        updatedAt: now
      });
    }
  }
});

async function findDuplicate(
  ctx: MutationCtx,
  userId: Awaited<ReturnType<typeof getOrCreateCurrentUser>>["_id"],
  transaction: ValidatableTransaction
) {
  const candidate = await ctx.db
    .query("transactions")
    .withIndex("by_dedupe_hash", (q) => q.eq("dedupeHash", transaction.dedupeHash))
    .first();

  if (candidate?.userId === userId && !candidate.archivedAt) {
    return candidate;
  }

  const accountCandidates = await ctx.db
    .query("transactions")
    .withIndex("by_account_id", (q) => q.eq("accountId", transaction.accountId))
    .filter((q) => q.eq(q.field("archivedAt"), undefined))
    .collect();

  return (
    accountCandidates.find(
      (accountCandidate) =>
        accountCandidate.userId === userId && arePotentialDuplicates(accountCandidate, transaction)
    ) ?? null
  );
}

function arePotentialDuplicates(left: DuplicateCandidate | ValidatableTransaction, right: ValidatableTransaction) {
  if (left.accountId !== right.accountId || left.currency !== right.currency) {
    return false;
  }

  if (toDayKey(left.postedAt) !== toDayKey(right.postedAt)) {
    return false;
  }

  if (toMinorUnits(left.amount) !== toMinorUnits(right.amount)) {
    return false;
  }

  const leftMerchant = left.merchant ?? left.description;
  const rightMerchant = right.merchant ?? right.description;
  const merchantScore = similarityScore(leftMerchant, rightMerchant);
  const descriptionScore = similarityScore(left.description, right.description);

  return (
    (merchantScore >= 0.86 && descriptionScore >= 0.72) ||
    (merchantScore >= 0.72 && descriptionScore >= 0.86) ||
    similarityScore(`${leftMerchant} ${left.description}`, `${rightMerchant} ${right.description}`) >= 0.88
  );
}

function toDayKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function toMinorUnits(amount: number) {
  return Math.round(amount * 100);
}

function similarityScore(left: string, right: string) {
  const normalizedLeft = normalizeForSimilarity(left);
  const normalizedRight = normalizeForSimilarity(right);

  if (normalizedLeft.length === 0 || normalizedRight.length === 0) {
    return normalizedLeft === normalizedRight ? 1 : 0;
  }

  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return Math.min(normalizedLeft.length, normalizedRight.length) / Math.max(normalizedLeft.length, normalizedRight.length);
  }

  return 1 - levenshteinDistance(normalizedLeft, normalizedRight) / Math.max(normalizedLeft.length, normalizedRight.length);
}

function normalizeForSimilarity(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(card|payment|purchase|pos|transaction|transfer|online|bank)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex + 1;

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const insertion = previous[rightIndex + 1] + 1;
      const deletion = previous[rightIndex] + 1;
      const substitution = diagonal + (left[leftIndex] === right[rightIndex] ? 0 : 1);
      diagonal = previous[rightIndex + 1];
      previous[rightIndex + 1] = Math.min(insertion, deletion, substitution);
    }
  }

  return previous[right.length];
}

function isValidTransaction(transaction: ValidatableTransaction) {
  try {
    validateTransaction(transaction);
    return true;
  } catch {
    return false;
  }
}

function validateTransaction(transaction: ValidatableTransaction) {
  if (!Number.isFinite(transaction.amount) || !Number.isFinite(transaction.baseCurrencyAmount)) {
    throw new Error("Transaction amount must be a valid number");
  }

  if (!Number.isFinite(transaction.postedAt)) {
    throw new Error("Transaction date is invalid");
  }

  if (transaction.description.trim().length === 0) {
    throw new Error("Transaction description is required");
  }

  if (transaction.dedupeHash.trim().length === 0) {
    throw new Error("Transaction dedupe hash is required");
  }
}
