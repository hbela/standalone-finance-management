import { v } from "convex/values";

import { mutation, query } from "./_generated/server";

async function getAuthenticatedClerkUserId(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("Unauthenticated");
  }

  return identity.subject;
}

export const current = query({
  args: {},
  handler: async (ctx) => {
    const clerkUserId = await getAuthenticatedClerkUserId(ctx);

    return await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();
  }
});

export const upsertCurrent = mutation({
  args: {
    country: v.union(v.literal("HU"), v.literal("FR")),
    locale: v.string(),
    baseCurrency: v.union(
      v.literal("HUF"),
      v.literal("EUR"),
      v.literal("USD"),
      v.literal("GBP")
    )
  },
  handler: async (ctx, args) => {
    const clerkUserId = await getAuthenticatedClerkUserId(ctx);
    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: now
      });

      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkUserId,
      ...args,
      createdAt: now,
      updatedAt: now
    });
  }
});
