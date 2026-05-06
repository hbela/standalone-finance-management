import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";

const providerName = v.union(v.literal("tink"), v.literal("wise"));

export const apiPutProviderToken = mutation({
  args: {
    apiSecret: v.string(),
    tokenRef: v.string(),
    clerkUserId: v.string(),
    provider: providerName,
    ciphertext: v.string(),
    iv: v.string(),
    authTag: v.string(),
    algorithm: v.literal("aes-256-gcm"),
    version: v.number()
  },
  handler: async (ctx, args) => {
    verifyApiSecret(args.apiSecret);

    const user = await getOrCreateUserByClerkId(ctx, args.clerkUserId);

    const existing = await ctx.db
      .query("providerTokens")
      .withIndex("by_token_ref", (q) => q.eq("tokenRef", args.tokenRef))
      .unique();

    if (existing) {
      throw new Error("tokenRef collision");
    }

    const now = Date.now();
    await ctx.db.insert("providerTokens", {
      tokenRef: args.tokenRef,
      userId: user._id,
      provider: args.provider,
      ciphertext: args.ciphertext,
      iv: args.iv,
      authTag: args.authTag,
      algorithm: args.algorithm,
      version: args.version,
      createdAt: now,
      updatedAt: now
    });
  }
});

export const apiGetProviderToken = query({
  args: {
    apiSecret: v.string(),
    tokenRef: v.string()
  },
  handler: async (ctx, args) => {
    verifyApiSecret(args.apiSecret);

    const row = await ctx.db
      .query("providerTokens")
      .withIndex("by_token_ref", (q) => q.eq("tokenRef", args.tokenRef))
      .unique();

    if (!row) {
      return null;
    }

    return {
      tokenRef: row.tokenRef,
      provider: row.provider,
      ciphertext: row.ciphertext,
      iv: row.iv,
      authTag: row.authTag,
      algorithm: row.algorithm,
      version: row.version
    };
  }
});

export const apiUpdateProviderToken = mutation({
  args: {
    apiSecret: v.string(),
    tokenRef: v.string(),
    ciphertext: v.string(),
    iv: v.string(),
    authTag: v.string(),
    algorithm: v.literal("aes-256-gcm"),
    version: v.number()
  },
  handler: async (ctx, args) => {
    verifyApiSecret(args.apiSecret);

    const row = await ctx.db
      .query("providerTokens")
      .withIndex("by_token_ref", (q) => q.eq("tokenRef", args.tokenRef))
      .unique();

    if (!row) {
      throw new Error("tokenRef not found");
    }

    await ctx.db.patch(row._id, {
      ciphertext: args.ciphertext,
      iv: args.iv,
      authTag: args.authTag,
      algorithm: args.algorithm,
      version: args.version,
      updatedAt: Date.now()
    });
  }
});

export const apiDeleteProviderToken = mutation({
  args: {
    apiSecret: v.string(),
    tokenRef: v.string()
  },
  handler: async (ctx, args) => {
    verifyApiSecret(args.apiSecret);

    const row = await ctx.db
      .query("providerTokens")
      .withIndex("by_token_ref", (q) => q.eq("tokenRef", args.tokenRef))
      .unique();

    if (!row) {
      return;
    }

    await ctx.db.delete(row._id);
  }
});

function verifyApiSecret(apiSecret: string) {
  if (!process.env.API_SERVICE_SECRET || apiSecret !== process.env.API_SERVICE_SECRET) {
    throw new Error("Invalid API service secret");
  }
}

async function getOrCreateUserByClerkId(ctx: MutationCtx, clerkUserId: string) {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .unique();

  if (existing) {
    return existing;
  }

  const now = Date.now();
  const userId = await ctx.db.insert("users", {
    clerkUserId,
    country: "HU",
    locale: "en-US",
    baseCurrency: "EUR",
    createdAt: now,
    updatedAt: now
  });
  const created = await ctx.db.get(userId);

  if (!created) {
    throw new Error("Could not create user profile");
  }

  return created;
}
