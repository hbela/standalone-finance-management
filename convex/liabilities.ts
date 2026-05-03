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
      .filter((q) => q.eq(q.field("archivedAt"), undefined))
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
    validateLiability(args);

    const user = await getOrCreateCurrentUser(ctx);

    if (args.linkedAccountId) {
      const account = await ctx.db.get(args.linkedAccountId);
      if (!account || account.userId !== user._id || account.archivedAt) {
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

export const update = mutation({
  args: {
    liabilityId: v.id("liabilities"),
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
    validateLiability(args);

    const user = await getOrCreateCurrentUser(ctx);
    const liability = await ctx.db.get(args.liabilityId);

    if (!liability || liability.userId !== user._id || liability.archivedAt) {
      throw new Error("Liability not found");
    }

    if (args.linkedAccountId) {
      const account = await ctx.db.get(args.linkedAccountId);
      if (!account || account.userId !== user._id || account.archivedAt) {
        throw new Error("Linked account not found");
      }
    }

    await ctx.db.patch(args.liabilityId, {
      linkedAccountId: args.linkedAccountId,
      name: args.name,
      institution: args.institution,
      type: args.type,
      currency: args.currency,
      originalPrincipal: args.originalPrincipal,
      outstandingBalance: args.outstandingBalance,
      interestRate: args.interestRate,
      paymentAmount: args.paymentAmount,
      paymentFrequency: args.paymentFrequency,
      nextDueDate: args.nextDueDate,
      rateType: args.rateType,
      updatedAt: Date.now()
    });
  }
});

export const archive = mutation({
  args: {
    liabilityId: v.id("liabilities")
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    const liability = await ctx.db.get(args.liabilityId);

    if (!liability || liability.userId !== user._id || liability.archivedAt) {
      throw new Error("Liability not found");
    }

    const now = Date.now();
    await ctx.db.patch(args.liabilityId, {
      archivedAt: now,
      updatedAt: now
    });
  }
});

function validateLiability(input: {
  name: string;
  institution: string;
  originalPrincipal: number;
  outstandingBalance: number;
  interestRate: number;
  paymentAmount: number;
  nextDueDate: string;
}) {
  if (input.name.trim().length === 0) {
    throw new Error("Liability name is required");
  }

  if (input.institution.trim().length === 0) {
    throw new Error("Institution is required");
  }

  for (const value of [input.originalPrincipal, input.outstandingBalance, input.interestRate, input.paymentAmount]) {
    if (!Number.isFinite(value)) {
      throw new Error("Liability amounts must be valid numbers");
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.nextDueDate) || Number.isNaN(Date.parse(input.nextDueDate))) {
    throw new Error("Next due date is invalid");
  }
}
