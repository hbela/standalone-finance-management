import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { getCurrentUser } from "./model";
import {
  detectRecurringGroups,
  type DetectableTransaction
} from "../apps/api/src/recurringDetection.js";

type Transaction = Doc<"transactions">;
type Stream = Doc<"incomeStreams">;

function toDetectable(transaction: Transaction): DetectableTransaction {
  return {
    _id: transaction._id,
    accountId: transaction.accountId,
    amount: transaction.amount,
    currency: transaction.currency,
    type: transaction.type,
    merchant: transaction.merchant,
    description: transaction.description,
    categoryId: transaction.categoryId,
    tinkCategoryCode: transaction.tinkCategoryCode,
    postedAt: transaction.postedAt,
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
      .query("incomeStreams")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("archivedAt"), undefined))
      .collect();
  }
});

export const dismiss = mutation({
  args: { streamId: v.id("incomeStreams") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not signed in");
    const stream = await ctx.db.get(args.streamId);
    if (!stream || stream.userId !== user._id) throw new Error("Income stream not found");
    const now = Date.now();
    await ctx.db.patch(stream._id, { dismissedAt: now, updatedAt: now });
  }
});

export const confirm = mutation({
  args: { streamId: v.id("incomeStreams") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not signed in");
    const stream = await ctx.db.get(args.streamId);
    if (!stream || stream.userId !== user._id) throw new Error("Income stream not found");
    const now = Date.now();
    await ctx.db.patch(stream._id, { confirmedAt: now, dismissedAt: undefined, updatedAt: now });
  }
});

export const archive = mutation({
  args: { streamId: v.id("incomeStreams") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not signed in");
    const stream = await ctx.db.get(args.streamId);
    if (!stream || stream.userId !== user._id) throw new Error("Income stream not found");
    const now = Date.now();
    await ctx.db.patch(stream._id, { archivedAt: now, updatedAt: now });
  }
});

export const apiDetectForUser = mutation({
  args: {
    apiSecret: v.string(),
    clerkUserId: v.string()
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
    return await runDetectionForUser(ctx, user._id);
  }
});

async function runDetectionForUser(ctx: MutationCtx, userId: Id<"users">) {
  const transactions = await ctx.db
    .query("transactions")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .filter((q) => q.eq(q.field("archivedAt"), undefined))
    .collect();

  const allGroups = detectRecurringGroups(transactions.map(toDetectable));
  const incomeGroups = allGroups.filter(
    (group) => group.type === "income" && group.averageAmount > 0
  );

  const existingStreams = await ctx.db
    .query("incomeStreams")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .collect();
  const existingByGroupKey = new Map(existingStreams.map((stream) => [stream.groupKey, stream]));

  const now = Date.now();
  const seenGroupKeys = new Set<string>();
  let created = 0;
  let updated = 0;

  for (const group of incomeGroups) {
    seenGroupKeys.add(group.groupKey);
    const existing = existingByGroupKey.get(group.groupKey);

    if (existing) {
      if (existing.dismissedAt && existing.lastSeenAt >= group.lastSeenAt) continue;
      await ctx.db.patch(existing._id, {
        employerName: group.merchant,
        currency: group.currency as Stream["currency"],
        averageAmount: group.averageAmount,
        monthlyAverage: group.monthlyAmount,
        frequency: group.frequency,
        confidence: group.confidence,
        transactionCount: group.transactionIds.length,
        firstSeenAt: group.firstSeenAt,
        lastSeenAt: group.lastSeenAt,
        nextExpectedAt: group.nextExpectedAt,
        archivedAt: undefined,
        accountId: group.accountId as Id<"accounts">,
        updatedAt: now
      });
      updated += 1;
    } else {
      await ctx.db.insert("incomeStreams", {
        userId,
        accountId: group.accountId as Id<"accounts">,
        groupKey: group.groupKey,
        employerName: group.merchant,
        currency: group.currency as Stream["currency"],
        averageAmount: group.averageAmount,
        monthlyAverage: group.monthlyAmount,
        frequency: group.frequency,
        confidence: group.confidence,
        transactionCount: group.transactionIds.length,
        firstSeenAt: group.firstSeenAt,
        lastSeenAt: group.lastSeenAt,
        nextExpectedAt: group.nextExpectedAt,
        createdAt: now,
        updatedAt: now
      });
      created += 1;
    }
  }

  let archived = 0;
  for (const stream of existingStreams) {
    if (seenGroupKeys.has(stream.groupKey)) continue;
    if (stream.archivedAt) continue;
    await ctx.db.patch(stream._id, { archivedAt: now, updatedAt: now });
    archived += 1;
  }

  return {
    detected: incomeGroups.length,
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
