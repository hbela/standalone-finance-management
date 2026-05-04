import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { getCurrentUser, getOrCreateCurrentUser } from "./model";

export const listForCurrent = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return [];
    }

    return await ctx.db
      .query("importBatches")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .collect();
  }
});

export const revert = mutation({
  args: {
    importBatchId: v.id("importBatches")
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    const importBatch = await ctx.db.get(args.importBatchId);

    if (!importBatch || importBatch.userId !== user._id) {
      throw new Error("Import batch not found");
    }

    if (importBatch.status === "reverted") {
      return { reverted: 0 };
    }

    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_import_batch_id", (q) => q.eq("importBatchId", args.importBatchId))
      .filter((q) => q.eq(q.field("archivedAt"), undefined))
      .collect();
    const now = Date.now();
    const balanceDeltas = new Map<Id<"accounts">, number>();

    for (const transaction of transactions) {
      if (transaction.userId !== user._id) {
        continue;
      }

      await ctx.db.patch(transaction._id, {
        archivedAt: now,
        updatedAt: now
      });
      balanceDeltas.set(
        transaction.accountId,
        (balanceDeltas.get(transaction.accountId) ?? 0) - transaction.amount
      );
    }

    for (const [accountId, delta] of balanceDeltas.entries()) {
      const account = await ctx.db.get(accountId);
      if (account && account.userId === user._id && !account.archivedAt) {
        await ctx.db.patch(account._id, {
          currentBalance: account.currentBalance + delta,
          updatedAt: now
        });
      }
    }

    await ctx.db.patch(args.importBatchId, {
      status: "reverted",
      updatedAt: now
    });

    return { reverted: transactions.length };
  }
});
