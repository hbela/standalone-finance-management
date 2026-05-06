import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { getCurrentUser, getOrCreateCurrentUser } from "./model";

const providerName = v.union(v.literal("tink"), v.literal("wise"));

const countryCode = v.union(v.literal("HU"), v.literal("FR"), v.literal("GB"));

const providerConnectionStatus = v.union(
  v.literal("pending"),
  v.literal("connected"),
  v.literal("sync_failed"),
  v.literal("reconnect_required"),
  v.literal("disconnected"),
  v.literal("revoked")
);

const providerSyncStatus = v.union(
  v.literal("never_synced"),
  v.literal("syncing"),
  v.literal("success"),
  v.literal("partial_failure"),
  v.literal("failed")
);

export const listForCurrent = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return [];
    }

    return await ctx.db
      .query("providerConnections")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .collect();
  }
});

export const getForCurrent = query({
  args: {
    provider: providerName
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return null;
    }

    return await ctx.db
      .query("providerConnections")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", user._id).eq("provider", args.provider)
      )
      .unique();
  }
});

export const recordConnectionStarted = mutation({
  args: {
    provider: providerName,
    country: countryCode,
    scopes: v.array(v.string()),
    stateHash: v.string()
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);

    return await recordStartedForUser(ctx, {
      userId: user._id,
      provider: args.provider,
      country: args.country,
      scopes: args.scopes,
      stateHash: args.stateHash
    });
  }
});

export const markConnectionStatus = mutation({
  args: {
    provider: providerName,
    status: providerConnectionStatus,
    externalUserId: v.optional(v.string()),
    tokenRef: v.optional(v.string()),
    lastError: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    const connection = await ctx.db
      .query("providerConnections")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", user._id).eq("provider", args.provider)
      )
      .unique();

    if (!connection) {
      throw new Error("Provider connection not found");
    }

    await ctx.db.patch(connection._id, {
      status: args.status,
      externalUserId: args.externalUserId,
      tokenRef: args.tokenRef,
      lastError: args.lastError,
      updatedAt: Date.now()
    });
  }
});

export const markSyncStatus = mutation({
  args: {
    provider: providerName,
    status: providerSyncStatus,
    lastError: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    const connection = await ctx.db
      .query("providerConnections")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", user._id).eq("provider", args.provider)
      )
      .unique();

    if (!connection) {
      throw new Error("Provider connection not found");
    }

    const now = Date.now();
    await ctx.db.patch(connection._id, {
      lastSyncedAt: args.status === "success" ? now : connection.lastSyncedAt,
      lastSyncStatus: args.status,
      lastError: args.lastError,
      updatedAt: now
    });

    await ctx.db.insert("consentEvents", {
      userId: user._id,
      type: "provider_sync",
      status: "granted",
      metadata: {
        provider: args.provider,
        syncStatus: args.status
      },
      createdAt: now
    });
  }
});

export const apiRecordConnectionStarted = mutation({
  args: {
    apiSecret: v.string(),
    clerkUserId: v.string(),
    provider: providerName,
    country: countryCode,
    scopes: v.array(v.string()),
    stateHash: v.string(),
    externalUserId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    verifyApiSecret(args.apiSecret);

    const user = await getOrCreateUserByClerkId(ctx, args.clerkUserId);

    return await recordStartedForUser(ctx, {
      userId: user._id,
      provider: args.provider,
      country: args.country,
      scopes: args.scopes,
      stateHash: args.stateHash,
      externalUserId: args.externalUserId
    });
  }
});

export const apiMarkConnectionCompleted = mutation({
  args: {
    apiSecret: v.string(),
    provider: providerName,
    stateHash: v.string(),
    externalUserId: v.optional(v.string()),
    tokenRef: v.string(),
    scopes: v.array(v.string()),
    expiresAt: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    verifyApiSecret(args.apiSecret);

    const now = Date.now();
    const attempt = await ctx.db
      .query("providerConnectionAttempts")
      .withIndex("by_state_hash", (q) => q.eq("stateHash", args.stateHash))
      .unique();

    if (!attempt || attempt.provider !== args.provider) {
      throw new Error("Provider connection attempt not found");
    }

    const connection = await ctx.db
      .query("providerConnections")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", attempt.userId).eq("provider", args.provider)
      )
      .unique();

    if (!connection) {
      throw new Error("Provider connection not found");
    }

    await ctx.db.patch(connection._id, {
      externalUserId: args.externalUserId,
      status: "connected",
      scopes: args.scopes,
      tokenRef: args.tokenRef,
      lastSyncStatus: "never_synced",
      lastError: undefined,
      updatedAt: now
    });

    await ctx.db.patch(attempt._id, {
      status: "completed",
      updatedAt: now
    });

    await ctx.db.insert("consentEvents", {
      userId: attempt.userId,
      type: "provider_connection",
      status: "granted",
      metadata: {
        provider: args.provider,
        connectionId: connection._id,
        attemptId: attempt._id,
        scopes: args.scopes.join(" "),
        expiresAt: args.expiresAt ? String(args.expiresAt) : ""
      },
      createdAt: now
    });
  }
});

export const apiMarkConnectionFailed = mutation({
  args: {
    apiSecret: v.string(),
    provider: providerName,
    stateHash: v.string(),
    errorMessage: v.string()
  },
  handler: async (ctx, args) => {
    verifyApiSecret(args.apiSecret);

    const now = Date.now();
    const attempt = await ctx.db
      .query("providerConnectionAttempts")
      .withIndex("by_state_hash", (q) => q.eq("stateHash", args.stateHash))
      .unique();
    const connection =
      attempt && attempt.provider === args.provider
        ? await ctx.db
            .query("providerConnections")
            .withIndex("by_user_provider", (q) =>
              q.eq("userId", attempt.userId).eq("provider", args.provider)
            )
            .unique()
        : null;

    if (connection) {
      await ctx.db.patch(connection._id, {
        status: "reconnect_required",
        lastError: args.errorMessage,
        updatedAt: now
      });
    }

    if (attempt && attempt.provider === args.provider) {
      await ctx.db.patch(attempt._id, {
        status: "failed",
        errorMessage: args.errorMessage,
        updatedAt: now
      });
    }
  }
});

export const apiGetConnectionForUser = query({
  args: {
    apiSecret: v.string(),
    clerkUserId: v.string(),
    provider: providerName
  },
  handler: async (ctx, args) => {
    verifyApiSecret(args.apiSecret);

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();

    if (!user) {
      return null;
    }

    const connection = await ctx.db
      .query("providerConnections")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", user._id).eq("provider", args.provider)
      )
      .unique();

    if (!connection) {
      return null;
    }

    return {
      userId: user._id,
      connectionId: connection._id,
      provider: connection.provider,
      status: connection.status,
      externalUserId: connection.externalUserId,
      scopes: connection.scopes,
      tokenRef: connection.tokenRef,
      lastSyncedAt: connection.lastSyncedAt,
      lastSyncStatus: connection.lastSyncStatus,
      lastError: connection.lastError,
      lastErrorCode: connection.lastErrorCode,
      consentExpiresAt: connection.consentExpiresAt,
      credentialsId: connection.credentialsId,
      institutionName: connection.institutionName,
      updatedAt: connection.updatedAt
    };
  }
});

export const apiMarkSyncStatus = mutation({
  args: {
    apiSecret: v.string(),
    clerkUserId: v.string(),
    provider: providerName,
    status: providerSyncStatus,
    lastError: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    verifyApiSecret(args.apiSecret);

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();

    if (!user) {
      return;
    }

    const connection = await ctx.db
      .query("providerConnections")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", user._id).eq("provider", args.provider)
      )
      .unique();

    if (!connection) {
      return;
    }

    const now = Date.now();
    await ctx.db.patch(connection._id, {
      status: args.status === "failed" ? "sync_failed" : connection.status,
      lastSyncedAt: args.status === "success" ? now : connection.lastSyncedAt,
      lastSyncStatus: args.status,
      lastError: args.lastError,
      updatedAt: now
    });
  }
});

export const apiMarkConnectionReconnectRequired = mutation({
  args: {
    apiSecret: v.string(),
    clerkUserId: v.string(),
    provider: providerName,
    errorCode: v.string(),
    errorMessage: v.optional(v.string()),
    credentialId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    verifyApiSecret(args.apiSecret);

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();

    if (!user) {
      return { updated: false };
    }

    const connection = await ctx.db
      .query("providerConnections")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", user._id).eq("provider", args.provider)
      )
      .unique();

    if (!connection) {
      return { updated: false };
    }

    const now = Date.now();
    await ctx.db.patch(connection._id, {
      status: "reconnect_required",
      lastSyncStatus: "failed",
      lastError: args.errorMessage,
      lastErrorCode: args.errorCode,
      updatedAt: now
    });

    const metadata: Record<string, string> = {
      provider: args.provider,
      errorCode: args.errorCode
    };
    if (args.credentialId) {
      metadata.credentialId = args.credentialId;
    }
    if (args.errorMessage) {
      metadata.errorMessage = args.errorMessage;
    }

    await ctx.db.insert("consentEvents", {
      userId: user._id,
      type: "provider_reconnect",
      status: "revoked",
      metadata,
      createdAt: now
    });

    return { updated: true };
  }
});

export const apiGetClerkUserIdByExternalUserId = query({
  args: {
    apiSecret: v.string(),
    provider: providerName,
    externalUserId: v.string()
  },
  handler: async (ctx, args) => {
    verifyApiSecret(args.apiSecret);

    const connections = await ctx.db
      .query("providerConnections")
      .filter((q) =>
        q.and(
          q.eq(q.field("provider"), args.provider),
          q.eq(q.field("externalUserId"), args.externalUserId)
        )
      )
      .collect();

    if (connections.length === 0) {
      return null;
    }

    const user = await ctx.db.get(connections[0].userId);
    return user?.clerkUserId ?? null;
  }
});

export const apiUpdateConnectionConsent = mutation({
  args: {
    apiSecret: v.string(),
    clerkUserId: v.string(),
    provider: providerName,
    consentExpiresAt: v.optional(v.number()),
    credentialsId: v.optional(v.string()),
    institutionName: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    verifyApiSecret(args.apiSecret);

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();

    if (!user) {
      return { updated: false };
    }

    const connection = await ctx.db
      .query("providerConnections")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", user._id).eq("provider", args.provider)
      )
      .unique();

    if (!connection) {
      return { updated: false };
    }

    const patch: Record<string, unknown> = {
      updatedAt: Date.now()
    };
    if (args.consentExpiresAt !== undefined) {
      patch.consentExpiresAt = args.consentExpiresAt;
    }
    if (args.credentialsId !== undefined) {
      patch.credentialsId = args.credentialsId;
    }
    if (args.institutionName !== undefined) {
      patch.institutionName = args.institutionName;
    }

    await ctx.db.patch(connection._id, patch);

    return { updated: true };
  }
});

export const apiDisconnectConnection = mutation({
  args: {
    apiSecret: v.string(),
    clerkUserId: v.string(),
    provider: providerName
  },
  handler: async (ctx, args) => {
    verifyApiSecret(args.apiSecret);

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();

    if (!user) {
      return null;
    }

    const connection = await ctx.db
      .query("providerConnections")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", user._id).eq("provider", args.provider)
      )
      .unique();

    if (!connection) {
      return null;
    }

    const now = Date.now();
    await ctx.db.patch(connection._id, {
      status: "disconnected",
      tokenRef: undefined,
      lastError: undefined,
      updatedAt: now
    });

    await ctx.db.insert("consentEvents", {
      userId: user._id,
      type: "provider_disconnect",
      status: "revoked",
      metadata: {
        provider: args.provider,
        connectionId: connection._id
      },
      createdAt: now
    });

    return {
      tokenRef: connection.tokenRef
    };
  }
});

async function recordStartedForUser(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    provider: "tink" | "wise";
    country: "HU" | "FR" | "GB";
    scopes: string[];
    stateHash: string;
    externalUserId?: string;
  }
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("providerConnections")
    .withIndex("by_user_provider", (q) =>
      q.eq("userId", args.userId).eq("provider", args.provider)
    )
    .unique();

  const connectionPatch = {
    country: args.country,
    status: "pending" as const,
    scopes: args.scopes,
    lastSyncStatus: "never_synced" as const,
    lastError: undefined,
    updatedAt: now,
    ...(args.externalUserId ? { externalUserId: args.externalUserId } : {})
  };

  const connectionId = existing
    ? existing._id
    : await ctx.db.insert("providerConnections", {
        userId: args.userId,
        provider: args.provider,
        createdAt: now,
        ...connectionPatch
      });

  if (existing) {
    await ctx.db.patch(existing._id, connectionPatch);
  }

  const attemptId = await ctx.db.insert("providerConnectionAttempts", {
    userId: args.userId,
    provider: args.provider,
    country: args.country,
    stateHash: args.stateHash,
    status: "started",
    createdAt: now,
    updatedAt: now
  });

  await ctx.db.insert("consentEvents", {
    userId: args.userId,
    type: "provider_connection",
    status: "granted",
    metadata: {
      provider: args.provider,
      country: args.country,
      connectionId,
      attemptId,
      scopes: args.scopes.join(" ")
    },
    createdAt: now
  });

  return { connectionId, attemptId };
}

async function getOrCreateUserByClerkId(
  ctx: MutationCtx,
  clerkUserId: string
) {
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

function verifyApiSecret(apiSecret: string) {
  if (!process.env.API_SERVICE_SECRET || apiSecret !== process.env.API_SERVICE_SECRET) {
    throw new Error("Invalid API service secret");
  }
}
