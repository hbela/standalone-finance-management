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
  type: transactionType,
  isRecurring: v.boolean(),
  isExcludedFromReports: v.boolean(),
  dedupeHash: v.string(),
  notes: v.optional(v.string())
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
      .collect();
  }
});

export const createManual = mutation({
  args: transactionInput,
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    const account = await ctx.db.get(args.accountId);

    if (!account || account.userId !== user._id) {
      throw new Error("Account not found");
    }

    const duplicate = await findDuplicate(ctx, user._id, args.dedupeHash);
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
    transactions: v.array(v.object(transactionInput))
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    const seen = new Set<string>();
    let imported = 0;
    let skipped = 0;
    const balanceDeltas = new Map<Id<"accounts">, number>();

    for (const transaction of args.transactions) {
      if (seen.has(transaction.dedupeHash)) {
        skipped += 1;
        continue;
      }
      seen.add(transaction.dedupeHash);

      const account = await ctx.db.get(transaction.accountId);
      if (!account || account.userId !== user._id) {
        skipped += 1;
        continue;
      }

      const duplicate = await findDuplicate(ctx, user._id, transaction.dedupeHash);
      if (duplicate) {
        skipped += 1;
        continue;
      }

      const now = Date.now();
      await ctx.db.insert("transactions", {
        userId: user._id,
        ...transaction,
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

    return { imported, skipped };
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
    isExcludedFromReports: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    const transaction = await ctx.db.get(args.transactionId);

    if (!transaction || transaction.userId !== user._id) {
      throw new Error("Transaction not found");
    }

    await ctx.db.patch(args.transactionId, {
      categoryId: args.categoryId,
      type: args.type,
      merchant: args.merchant,
      description: args.description,
      notes: args.notes,
      isRecurring: args.isRecurring,
      isExcludedFromReports: args.isExcludedFromReports,
      updatedAt: Date.now()
    });
  }
});

async function findDuplicate(
  ctx: MutationCtx,
  userId: Awaited<ReturnType<typeof getOrCreateCurrentUser>>["_id"],
  dedupeHash: string
) {
  const candidate = await ctx.db
    .query("transactions")
    .withIndex("by_dedupe_hash", (q) => q.eq("dedupeHash", dedupeHash))
    .first();

  if (candidate?.userId === userId) {
    return candidate;
  }

  return null;
}
