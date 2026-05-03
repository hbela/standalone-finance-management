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
