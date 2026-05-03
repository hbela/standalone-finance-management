import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
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

const accountType = v.union(
  v.literal("checking"),
  v.literal("savings"),
  v.literal("credit"),
  v.literal("loan"),
  v.literal("mortgage"),
  v.literal("wise_balance"),
  v.literal("cash")
);

export const listForCurrent = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return [];
    }

    return await ctx.db
      .query("accounts")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("archivedAt"), undefined))
      .collect();
  }
});

export const createManual = mutation({
  args: {
    source: accountSource,
    bankKey: v.optional(v.string()),
    name: v.string(),
    currency: currencyCode,
    type: accountType,
    currentBalance: v.number()
  },
  handler: async (ctx, args) => {
    validateAccount(args.name, args.currentBalance);

    const user = await getOrCreateCurrentUser(ctx);
    const now = Date.now();

    return await ctx.db.insert("accounts", {
      userId: user._id,
      source: args.source,
      bankKey: args.bankKey,
      name: args.name,
      currency: args.currency,
      type: args.type,
      currentBalance: args.currentBalance,
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now
    });
  }
});

export const update = mutation({
  args: {
    accountId: v.id("accounts"),
    source: accountSource,
    bankKey: v.optional(v.string()),
    name: v.string(),
    currency: currencyCode,
    type: accountType,
    currentBalance: v.number()
  },
  handler: async (ctx, args) => {
    validateAccount(args.name, args.currentBalance);

    const user = await getOrCreateCurrentUser(ctx);
    const account = await ctx.db.get(args.accountId);

    if (!account || account.userId !== user._id || account.archivedAt) {
      throw new Error("Account not found");
    }

    await ctx.db.patch(args.accountId, {
      source: args.source,
      bankKey: args.bankKey,
      name: args.name,
      currency: args.currency,
      type: args.type,
      currentBalance: args.currentBalance,
      updatedAt: Date.now()
    });
  }
});

export const archive = mutation({
  args: {
    accountId: v.id("accounts")
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    const account = await ctx.db.get(args.accountId);

    if (!account || account.userId !== user._id || account.archivedAt) {
      throw new Error("Account not found");
    }

    const now = Date.now();
    await ctx.db.patch(args.accountId, {
      archivedAt: now,
      updatedAt: now
    });

    const linkedTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_account_id", (q) => q.eq("accountId", args.accountId))
      .collect();

    for (const transaction of linkedTransactions) {
      if (transaction.userId === user._id && !transaction.archivedAt) {
        await ctx.db.patch(transaction._id, {
          archivedAt: now,
          updatedAt: now
        });
      }
    }

    const linkedLiabilities = await ctx.db
      .query("liabilities")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .collect();

    for (const liability of linkedLiabilities) {
      if (liability.linkedAccountId === args.accountId && !liability.archivedAt) {
        await ctx.db.patch(liability._id, {
          archivedAt: now,
          updatedAt: now
        });
      }
    }
  }
});

export const applyBalanceDelta = mutation({
  args: {
    accountId: v.id("accounts"),
    delta: v.number()
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    const account = await ctx.db.get(args.accountId);

    if (!account || account.userId !== user._id) {
      throw new Error("Account not found");
    }

    await ctx.db.patch(args.accountId, {
      currentBalance: account.currentBalance + args.delta,
      updatedAt: Date.now()
    });
  }
});

function validateAccount(name: string, currentBalance: number) {
  if (name.trim().length === 0) {
    throw new Error("Account name is required");
  }

  if (!Number.isFinite(currentBalance)) {
    throw new Error("Account balance must be a valid number");
  }
}
