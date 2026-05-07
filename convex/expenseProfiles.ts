import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { getCurrentUser } from "./model";
import {
  computeExpenseProfiles,
  type ExpenseProfileTransaction
} from "../apps/api/src/expenseProfiling.js";

type Transaction = Doc<"transactions">;
type Profile = Doc<"expenseProfiles">;

function toExpenseTransaction(transaction: Transaction): ExpenseProfileTransaction {
  return {
    amount: transaction.amount,
    currency: transaction.currency,
    type: transaction.type,
    postedAt: transaction.postedAt,
    categoryId: transaction.categoryId,
    tinkCategoryCode: transaction.tinkCategoryCode,
    isExcludedFromReports: transaction.isExcludedFromReports,
    transferMatchId: transaction.transferMatchId,
    archivedAt: transaction.archivedAt
  };
}

export const listForCurrent = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    return await ctx.db
      .query("expenseProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("archivedAt"), undefined))
      .collect();
  }
});

export const dismiss = mutation({
  args: { profileId: v.id("expenseProfiles") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not signed in");
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.userId !== user._id) throw new Error("Expense profile not found");
    const now = Date.now();
    await ctx.db.patch(profile._id, { dismissedAt: now, updatedAt: now });
  }
});

export const confirm = mutation({
  args: { profileId: v.id("expenseProfiles") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not signed in");
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.userId !== user._id) throw new Error("Expense profile not found");
    const now = Date.now();
    await ctx.db.patch(profile._id, { confirmedAt: now, dismissedAt: undefined, updatedAt: now });
  }
});

export const archive = mutation({
  args: { profileId: v.id("expenseProfiles") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not signed in");
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.userId !== user._id) throw new Error("Expense profile not found");
    const now = Date.now();
    await ctx.db.patch(profile._id, { archivedAt: now, updatedAt: now });
  }
});

export const apiDetectForUser = mutation({
  args: {
    apiSecret: v.string(),
    clerkUserId: v.string(),
    lookbackMonths: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    verifyApiSecret(args.apiSecret);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (!user) {
      return { detected: 0, created: 0, updated: 0, archived: 0 };
    }
    return await runDetectionForUser(ctx, user._id, args.lookbackMonths);
  }
});

async function runDetectionForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  lookbackMonths: number | undefined
) {
  const transactions = await ctx.db
    .query("transactions")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .filter((q) => q.eq(q.field("archivedAt"), undefined))
    .collect();

  const profiles = computeExpenseProfiles(transactions.map(toExpenseTransaction), {
    lookbackMonths
  });

  const existingProfiles = await ctx.db
    .query("expenseProfiles")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .collect();
  const existingByGroupKey = new Map(existingProfiles.map((profile) => [profile.groupKey, profile]));

  const now = Date.now();
  const seenGroupKeys = new Set<string>();
  let created = 0;
  let updated = 0;

  for (const profile of profiles) {
    seenGroupKeys.add(profile.groupKey);
    const existing = existingByGroupKey.get(profile.groupKey);

    if (existing) {
      if (existing.dismissedAt && existing.lastSeenAt >= profile.lastSeenAt) continue;
      await ctx.db.patch(existing._id, {
        category: profile.category,
        currency: profile.currency as Profile["currency"],
        monthlyAverage: profile.monthlyAverage,
        totalAmount: profile.totalAmount,
        monthsObserved: profile.monthsObserved,
        transactionCount: profile.transactionCount,
        firstSeenAt: profile.firstSeenAt,
        lastSeenAt: profile.lastSeenAt,
        confidence: profile.confidence,
        archivedAt: undefined,
        updatedAt: now
      });
      updated += 1;
    } else {
      await ctx.db.insert("expenseProfiles", {
        userId,
        groupKey: profile.groupKey,
        category: profile.category,
        currency: profile.currency as Profile["currency"],
        monthlyAverage: profile.monthlyAverage,
        totalAmount: profile.totalAmount,
        monthsObserved: profile.monthsObserved,
        transactionCount: profile.transactionCount,
        firstSeenAt: profile.firstSeenAt,
        lastSeenAt: profile.lastSeenAt,
        confidence: profile.confidence,
        createdAt: now,
        updatedAt: now
      });
      created += 1;
    }
  }

  let archived = 0;
  for (const existing of existingProfiles) {
    if (seenGroupKeys.has(existing.groupKey)) continue;
    if (existing.archivedAt) continue;
    await ctx.db.patch(existing._id, { archivedAt: now, updatedAt: now });
    archived += 1;
  }

  return {
    detected: profiles.length,
    created,
    updated,
    archived
  };
}

function verifyApiSecret(apiSecret: string) {
  if (!process.env.API_SERVICE_SECRET || apiSecret !== process.env.API_SERVICE_SECRET) {
    throw new Error("Invalid API service secret");
  }
}
