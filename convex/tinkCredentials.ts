import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./model";

const credentialStatus = v.union(
  v.literal("connected"),
  v.literal("reconnect_required"),
  v.literal("temporary_error"),
  v.literal("unknown")
);

const providerName = v.union(v.literal("tink"), v.literal("wise"));

export const apiUpsertTinkCredentials = mutation({
  args: {
    apiSecret: v.string(),
    clerkUserId: v.string(),
    provider: providerName,
    credentials: v.array(
      v.object({
        credentialsId: v.string(),
        providerName: v.optional(v.string()),
        institutionName: v.optional(v.string()),
        status: credentialStatus,
        statusCode: v.optional(v.string()),
        consentExpiresAt: v.optional(v.number()),
        sessionExtendable: v.optional(v.boolean())
      })
    )
  },
  handler: async (ctx, args) => {
    verifyApiSecret(args.apiSecret);

    if (args.provider !== "tink") {
      throw new Error("apiUpsertTinkCredentials only supports Tink");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (!user) {
      return { upsertedCount: 0, archivedCount: 0 };
    }

    const connection = await ctx.db
      .query("providerConnections")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", user._id).eq("provider", "tink")
      )
      .unique();
    if (!connection) {
      return { upsertedCount: 0, archivedCount: 0 };
    }

    const now = Date.now();
    const existingRows = await ctx.db
      .query("tinkCredentials")
      .withIndex("by_provider_connection_id", (q) =>
        q.eq("providerConnectionId", connection._id)
      )
      .collect();
    const existingByCredentialsId = new Map(
      existingRows.map((row) => [row.credentialsId, row])
    );
    const incomingIds = new Set(args.credentials.map((c) => c.credentialsId));

    let upsertedCount = 0;
    for (const incoming of args.credentials) {
      const existing = existingByCredentialsId.get(incoming.credentialsId);
      if (existing) {
        await ctx.db.patch(existing._id, {
          providerName: incoming.providerName,
          institutionName: incoming.institutionName,
          status: incoming.status,
          statusCode: incoming.statusCode,
          statusUpdatedAt: now,
          consentExpiresAt: incoming.consentExpiresAt,
          sessionExtendable: incoming.sessionExtendable,
          archivedAt: undefined,
          updatedAt: now
        });
      } else {
        await ctx.db.insert("tinkCredentials", {
          userId: user._id,
          providerConnectionId: connection._id,
          credentialsId: incoming.credentialsId,
          providerName: incoming.providerName,
          institutionName: incoming.institutionName,
          status: incoming.status,
          statusCode: incoming.statusCode,
          statusUpdatedAt: now,
          consentExpiresAt: incoming.consentExpiresAt,
          sessionExtendable: incoming.sessionExtendable,
          createdAt: now,
          updatedAt: now
        });
      }
      upsertedCount += 1;
    }

    let archivedCount = 0;
    for (const existing of existingRows) {
      if (incomingIds.has(existing.credentialsId)) continue;
      if (existing.archivedAt) continue;
      await ctx.db.patch(existing._id, {
        archivedAt: now,
        updatedAt: now
      });
      archivedCount += 1;
    }

    return { upsertedCount, archivedCount };
  }
});

export const apiGetCredentialOwnership = query({
  args: {
    apiSecret: v.string(),
    clerkUserId: v.string(),
    credentialsId: v.string()
  },
  handler: async (ctx, args) => {
    verifyApiSecret(args.apiSecret);

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (!user) return { owned: false };

    const row = await ctx.db
      .query("tinkCredentials")
      .withIndex("by_credentials_id", (q) => q.eq("credentialsId", args.credentialsId))
      .unique();
    if (!row || row.userId !== user._id || row.archivedAt) {
      return { owned: false };
    }

    return {
      owned: true,
      credentialsId: row.credentialsId,
      providerName: row.providerName,
      institutionName: row.institutionName,
      status: row.status
    };
  }
});

export const listForCurrent = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const rows = await ctx.db
      .query("tinkCredentials")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("archivedAt"), undefined))
      .collect();

    return rows
      .map((row) => ({
        id: row._id,
        credentialsId: row.credentialsId,
        providerName: row.providerName,
        institutionName: row.institutionName,
        status: row.status,
        statusCode: row.statusCode,
        statusUpdatedAt: row.statusUpdatedAt,
        consentExpiresAt: row.consentExpiresAt,
        sessionExtendable: row.sessionExtendable,
        updatedAt: row.updatedAt
      }))
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }
});

function verifyApiSecret(apiSecret: string) {
  if (!process.env.API_SERVICE_SECRET || apiSecret !== process.env.API_SERVICE_SECRET) {
    throw new Error("Invalid API service secret");
  }
}
