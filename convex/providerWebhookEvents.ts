import { v } from "convex/values";

import { mutation } from "./_generated/server";

const providerName = v.union(v.literal("tink"), v.literal("wise"));

const eventStatus = v.union(
  v.literal("received"),
  v.literal("processed"),
  v.literal("failed"),
  v.literal("ignored")
);

export const apiRecordProviderWebhookEvent = mutation({
  args: {
    apiSecret: v.string(),
    provider: providerName,
    eventId: v.string(),
    eventType: v.string(),
    payloadDigest: v.string(),
    externalUserId: v.optional(v.string()),
    credentialsId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    verifyApiSecret(args.apiSecret);

    const existing = await ctx.db
      .query("providerWebhookEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .unique();

    if (existing) {
      return { duplicate: true, eventId: args.eventId };
    }

    await ctx.db.insert("providerWebhookEvents", {
      provider: args.provider,
      eventId: args.eventId,
      eventType: args.eventType,
      receivedAt: Date.now(),
      status: "received",
      payloadDigest: args.payloadDigest,
      externalUserId: args.externalUserId,
      credentialsId: args.credentialsId
    });

    return { duplicate: false, eventId: args.eventId };
  }
});

export const apiMarkProviderWebhookEventProcessed = mutation({
  args: {
    apiSecret: v.string(),
    eventId: v.string(),
    status: eventStatus,
    errorMessage: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    verifyApiSecret(args.apiSecret);

    const row = await ctx.db
      .query("providerWebhookEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .unique();

    if (!row) {
      return { updated: false };
    }

    await ctx.db.patch(row._id, {
      processedAt: Date.now(),
      status: args.status,
      errorMessage: args.errorMessage
    });

    return { updated: true };
  }
});

function verifyApiSecret(apiSecret: string) {
  if (!process.env.API_SERVICE_SECRET || apiSecret !== process.env.API_SERVICE_SECRET) {
    throw new Error("Invalid API service secret");
  }
}
