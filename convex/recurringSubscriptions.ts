import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { getCurrentUser } from "./model";
import {
  detectRecurringGroups,
  type DetectableTransaction,
  type DetectedGroup
} from "../apps/api/src/recurringDetection.js";

type Transaction = Doc<"transactions">;
type Subscription = Doc<"recurringSubscriptions">;

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
      .query("recurringSubscriptions")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("archivedAt"), undefined))
      .collect();
  }
});

export const dismiss = mutation({
  args: { subscriptionId: v.id("recurringSubscriptions") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not signed in");
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription || subscription.userId !== user._id) {
      throw new Error("Subscription not found");
    }
    const now = Date.now();
    await ctx.db.patch(subscription._id, { dismissedAt: now, updatedAt: now });
    if (subscription.confirmedAt) {
      await clearTransactionRecurringTags(ctx, user._id, subscription._id);
    }
  }
});

export const confirm = mutation({
  args: { subscriptionId: v.id("recurringSubscriptions") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not signed in");
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription || subscription.userId !== user._id) {
      throw new Error("Subscription not found");
    }
    const now = Date.now();
    await ctx.db.patch(subscription._id, {
      confirmedAt: now,
      dismissedAt: undefined,
      updatedAt: now
    });
  }
});

export const archive = mutation({
  args: { subscriptionId: v.id("recurringSubscriptions") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not signed in");
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription || subscription.userId !== user._id) {
      throw new Error("Subscription not found");
    }
    const now = Date.now();
    await ctx.db.patch(subscription._id, { archivedAt: now, updatedAt: now });
    await clearTransactionRecurringTags(ctx, user._id, subscription._id);
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
      return { detected: 0, created: 0, updated: 0, archived: 0, taggedTransactions: 0 };
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

  const groups = detectRecurringGroups(transactions.map(toDetectable)).filter(
    (group) => group.type !== "income"
  );

  const existingSubscriptions = await ctx.db
    .query("recurringSubscriptions")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .collect();
  const existingByGroupKey = new Map(existingSubscriptions.map((sub) => [sub.groupKey, sub]));

  const now = Date.now();
  const seenGroupKeys = new Set<string>();
  const groupKeyToSubscriptionId = new Map<string, Id<"recurringSubscriptions">>();
  let created = 0;
  let updated = 0;

  for (const group of groups) {
    const existing = existingByGroupKey.get(group.groupKey);
    seenGroupKeys.add(group.groupKey);

    if (existing) {
      if (existing.dismissedAt && existing.lastSeenAt >= group.lastSeenAt) {
        groupKeyToSubscriptionId.set(group.groupKey, existing._id);
        continue;
      }

      await ctx.db.patch(existing._id, {
        merchant: group.merchant,
        category: group.category,
        type: group.type as Subscription["type"],
        currency: group.currency as Subscription["currency"],
        averageAmount: group.averageAmount,
        monthlyAmount: group.monthlyAmount,
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
      groupKeyToSubscriptionId.set(group.groupKey, existing._id);
      updated += 1;
    } else {
      const inserted = await ctx.db.insert("recurringSubscriptions", {
        userId,
        accountId: group.accountId as Id<"accounts">,
        groupKey: group.groupKey,
        merchant: group.merchant,
        category: group.category,
        type: group.type as Subscription["type"],
        currency: group.currency as Subscription["currency"],
        averageAmount: group.averageAmount,
        monthlyAmount: group.monthlyAmount,
        frequency: group.frequency,
        confidence: group.confidence,
        transactionCount: group.transactionIds.length,
        firstSeenAt: group.firstSeenAt,
        lastSeenAt: group.lastSeenAt,
        nextExpectedAt: group.nextExpectedAt,
        createdAt: now,
        updatedAt: now
      });
      groupKeyToSubscriptionId.set(group.groupKey, inserted);
      created += 1;
    }
  }

  let archived = 0;
  for (const subscription of existingSubscriptions) {
    if (seenGroupKeys.has(subscription.groupKey)) continue;
    if (subscription.archivedAt) continue;
    await ctx.db.patch(subscription._id, { archivedAt: now, updatedAt: now });
    await clearTransactionRecurringTags(ctx, userId, subscription._id);
    archived += 1;
  }

  let taggedTransactions = 0;
  const desiredTagsByTxId = new Map<Id<"transactions">, Id<"recurringSubscriptions">>();
  for (const group of groups) {
    const subscriptionId = groupKeyToSubscriptionId.get(group.groupKey);
    if (!subscriptionId) continue;
    for (const txId of group.transactionIds) {
      desiredTagsByTxId.set(txId as Id<"transactions">, subscriptionId);
    }
  }

  for (const transaction of transactions) {
    const desiredSubscriptionId = desiredTagsByTxId.get(transaction._id);
    if (desiredSubscriptionId) {
      if (
        transaction.recurringGroupId !== desiredSubscriptionId ||
        transaction.isRecurring !== true
      ) {
        await ctx.db.patch(transaction._id, {
          isRecurring: true,
          recurringGroupId: desiredSubscriptionId,
          updatedAt: now
        });
        taggedTransactions += 1;
      }
    } else if (transaction.recurringGroupId) {
      await ctx.db.patch(transaction._id, {
        isRecurring: false,
        recurringGroupId: undefined,
        updatedAt: now
      });
      taggedTransactions += 1;
    }
  }

  return {
    detected: groups.length,
    created,
    updated,
    archived,
    taggedTransactions
  };
}

async function clearTransactionRecurringTags(
  ctx: MutationCtx,
  userId: Id<"users">,
  subscriptionId: Id<"recurringSubscriptions">
) {
  const tagged = await ctx.db
    .query("transactions")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .filter((q) => q.eq(q.field("recurringGroupId"), subscriptionId))
    .collect();
  const now = Date.now();
  for (const transaction of tagged) {
    await ctx.db.patch(transaction._id, {
      isRecurring: false,
      recurringGroupId: undefined,
      updatedAt: now
    });
  }
}

function verifyApiSecret(apiSecret: string) {
  if (!process.env.API_SERVICE_SECRET || apiSecret !== process.env.API_SERVICE_SECRET) {
    throw new Error("Invalid API service secret");
  }
}

export type { DetectedGroup };
