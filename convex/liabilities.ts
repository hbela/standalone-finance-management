import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { getCurrentUser, getOrCreateCurrentUser } from "./model";

const currencyCode = v.union(
  v.literal("HUF"),
  v.literal("EUR"),
  v.literal("USD"),
  v.literal("GBP")
);

const liabilityType = v.union(
  v.literal("personal_loan"),
  v.literal("mortgage"),
  v.literal("student_loan"),
  v.literal("car_loan"),
  v.literal("credit_card_debt"),
  v.literal("other")
);

const paymentFrequency = v.union(
  v.literal("weekly"),
  v.literal("biweekly"),
  v.literal("monthly"),
  v.literal("quarterly"),
  v.literal("yearly")
);

const rateType = v.union(v.literal("fixed"), v.literal("variable"));

export const listForCurrent = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return [];
    }

    return await ctx.db
      .query("liabilities")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .collect();
  }
});

export const createManual = mutation({
  args: {
    linkedAccountId: v.optional(v.id("accounts")),
    name: v.string(),
    institution: v.string(),
    type: liabilityType,
    currency: currencyCode,
    originalPrincipal: v.number(),
    outstandingBalance: v.number(),
    interestRate: v.number(),
    paymentAmount: v.number(),
    paymentFrequency,
    nextDueDate: v.string(),
    rateType
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);

    if (args.linkedAccountId) {
      const account = await ctx.db.get(args.linkedAccountId);
      if (!account || account.userId !== user._id) {
        throw new Error("Linked account not found");
      }
    }

    const now = Date.now();

    return await ctx.db.insert("liabilities", {
      userId: user._id,
      ...args,
      createdAt: now,
      updatedAt: now
    });
  }
});
