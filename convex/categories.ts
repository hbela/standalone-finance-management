import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { getCurrentUser, getOrCreateCurrentUser } from "./model";

const defaultCategoryNames = [
  "Salary",
  "Freelance",
  "Housing",
  "Food",
  "Transport",
  "Utilities",
  "Subscriptions",
  "Healthcare",
  "Education",
  "Travel",
  "Taxes",
  "Fees",
  "Mortgage payment",
  "Loan payment",
  "Internal transfer",
  "Other"
];

export const listForCurrent = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return defaultCategoryNames.map((name) => ({ id: name, name, isDefault: true }));
    }

    const customCategories = await ctx.db
      .query("categories")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("archivedAt"), undefined))
      .collect();
    const defaultNames = new Set(defaultCategoryNames.map(normalizeCategoryName));
    const customRows = customCategories
      .filter((category) => !defaultNames.has(normalizeCategoryName(category.name)))
      .map((category) => ({ id: category.name, name: category.name, isDefault: false }));

    return [
      ...defaultCategoryNames.map((name) => ({ id: name, name, isDefault: true })),
      ...customRows.sort((left, right) => left.name.localeCompare(right.name))
    ];
  }
});

export const create = mutation({
  args: {
    name: v.string()
  },
  handler: async (ctx, args) => {
    const name = normalizeDisplayName(args.name);
    if (name.length === 0) {
      throw new Error("Category name is required");
    }

    const user = await getOrCreateCurrentUser(ctx);
    const normalizedName = normalizeCategoryName(name);
    if (defaultCategoryNames.some((categoryName) => normalizeCategoryName(categoryName) === normalizedName)) {
      return name;
    }

    const existing = await ctx.db
      .query("categories")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .collect();
    const match = existing.find((category) => normalizeCategoryName(category.name) === normalizedName);
    const now = Date.now();

    if (match) {
      if (match.archivedAt) {
        await ctx.db.patch(match._id, {
          name,
          archivedAt: undefined,
          updatedAt: now
        });
      }
      return match.name;
    }

    await ctx.db.insert("categories", {
      userId: user._id,
      name,
      createdAt: now,
      updatedAt: now
    });

    return name;
  }
});

export const archive = mutation({
  args: {
    name: v.string()
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    const normalizedName = normalizeCategoryName(args.name);
    if (defaultCategoryNames.some((categoryName) => normalizeCategoryName(categoryName) === normalizedName)) {
      throw new Error("Default categories cannot be archived");
    }

    const existing = await ctx.db
      .query("categories")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .collect();
    const match = existing.find((category) => normalizeCategoryName(category.name) === normalizedName);
    if (!match || match.archivedAt) {
      return;
    }

    const activeTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("archivedAt"), undefined))
      .collect();
    if (activeTransactions.some((transaction) => normalizeCategoryName(transaction.categoryId ?? "") === normalizedName)) {
      throw new Error("Category is used by active transactions");
    }

    await ctx.db.patch(match._id, {
      archivedAt: Date.now(),
      updatedAt: Date.now()
    });
  }
});

function normalizeDisplayName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeCategoryName(value: string) {
  return normalizeDisplayName(value).toLowerCase();
}
