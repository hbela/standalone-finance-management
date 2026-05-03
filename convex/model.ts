import type { MutationCtx, QueryCtx } from "./_generated/server";

type AuthContext = Pick<QueryCtx | MutationCtx, "auth" | "db">;

export async function getAuthenticatedClerkUserId(ctx: Pick<AuthContext, "auth">) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("Unauthenticated");
  }

  return identity.subject;
}

export async function getCurrentUser(ctx: AuthContext) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }

  return await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
}

export async function getOrCreateCurrentUser(ctx: MutationCtx) {
  const clerkUserId = await getAuthenticatedClerkUserId(ctx);
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
