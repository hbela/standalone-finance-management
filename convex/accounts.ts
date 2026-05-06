import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { getCurrentUser, getOrCreateCurrentUser } from "./model";

const currencyCode = v.union(
  v.literal("HUF"),
  v.literal("EUR"),
  v.literal("USD"),
  v.literal("GBP")
);

const accountSource = v.union(
  v.literal("local_bank"),
  v.literal("wise"),
  v.literal("manual")
);

const accountType = v.union(
  v.literal("checking"),
  v.literal("savings"),
  v.literal("credit"),
  v.literal("loan"),
  v.literal("mortgage"),
  v.literal("wise_balance"),
  v.literal("cash")
);

export const listForCurrent = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return [];
    }

    return await ctx.db
      .query("accounts")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("archivedAt"), undefined))
      .collect();
  }
});

export const createManual = mutation({
  args: {
    source: accountSource,
    bankKey: v.optional(v.string()),
    name: v.string(),
    currency: currencyCode,
    type: accountType,
    currentBalance: v.number()
  },
  handler: async (ctx, args) => {
    validateAccount(args.name, args.currentBalance);

    const user = await getOrCreateCurrentUser(ctx);
    const now = Date.now();

    return await ctx.db.insert("accounts", {
      userId: user._id,
      source: args.source,
      bankKey: args.bankKey,
      name: args.name,
      currency: args.currency,
      type: args.type,
      currentBalance: args.currentBalance,
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now
    });
  }
});

export const update = mutation({
  args: {
    accountId: v.id("accounts"),
    source: accountSource,
    bankKey: v.optional(v.string()),
    name: v.string(),
    currency: currencyCode,
    type: accountType,
    currentBalance: v.number()
  },
  handler: async (ctx, args) => {
    validateAccount(args.name, args.currentBalance);

    const user = await getOrCreateCurrentUser(ctx);
    const account = await ctx.db.get(args.accountId);

    if (!account || account.userId !== user._id || account.archivedAt) {
      throw new Error("Account not found");
    }

    await ctx.db.patch(args.accountId, {
      source: args.source,
      bankKey: args.bankKey,
      name: args.name,
      currency: args.currency,
      type: args.type,
      currentBalance: args.currentBalance,
      updatedAt: Date.now()
    });
  }
});

export const archive = mutation({
  args: {
    accountId: v.id("accounts")
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    const account = await ctx.db.get(args.accountId);

    if (!account || account.userId !== user._id || account.archivedAt) {
      throw new Error("Account not found");
    }

    const now = Date.now();
    await ctx.db.patch(args.accountId, {
      archivedAt: now,
      updatedAt: now
    });

    const linkedTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_account_id", (q) => q.eq("accountId", args.accountId))
      .collect();

    for (const transaction of linkedTransactions) {
      if (transaction.userId === user._id && !transaction.archivedAt) {
        await ctx.db.patch(transaction._id, {
          archivedAt: now,
          updatedAt: now
        });
      }
    }

    const linkedLiabilities = await ctx.db
      .query("liabilities")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .collect();

    for (const liability of linkedLiabilities) {
      if (liability.linkedAccountId === args.accountId && !liability.archivedAt) {
        await ctx.db.patch(liability._id, {
          archivedAt: now,
          updatedAt: now
        });
      }
    }
  }
});

export const applyBalanceDelta = mutation({
  args: {
    accountId: v.id("accounts"),
    delta: v.number()
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    const account = await ctx.db.get(args.accountId);

    if (!account || account.userId !== user._id) {
      throw new Error("Account not found");
    }

    await ctx.db.patch(args.accountId, {
      currentBalance: account.currentBalance + args.delta,
      updatedAt: Date.now()
    });
  }
});

export const apiUpsertProviderAccounts = mutation({
  args: {
    apiSecret: v.string(),
    clerkUserId: v.string(),
    provider: v.literal("tink"),
    accounts: v.array(
      v.object({
        providerAccountId: v.string(),
        bankKey: v.optional(v.string()),
        name: v.string(),
        currency: currencyCode,
        type: accountType,
        currentBalance: v.number(),
        availableBalance: v.optional(v.number()),
        institutionName: v.optional(v.string()),
        holderName: v.optional(v.string()),
        iban: v.optional(v.string()),
        bban: v.optional(v.string()),
        credentialsId: v.optional(v.string())
      })
    )
  },
  handler: async (ctx, args) => {
    verifyApiSecret(args.apiSecret);

    const user = await getOrCreateUserByClerkId(ctx, args.clerkUserId);
    const now = Date.now();
    let createdCount = 0;
    let updatedCount = 0;
    const upsertedAccounts: Array<{ providerAccountId: string; accountId: string }> = [];

    const existingAccounts = await ctx.db
      .query("accounts")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .collect();

    for (const providerAccount of args.accounts) {
      validateAccount(providerAccount.name, providerAccount.currentBalance);

      const existing = existingAccounts.find(
        (account) =>
          account.source === "local_bank" &&
          account.providerAccountId === providerAccount.providerAccountId
      );

      if (existing) {
        await ctx.db.patch(existing._id, {
          bankKey: providerAccount.bankKey,
          name: providerAccount.name,
          currency: providerAccount.currency,
          type: providerAccount.type,
          currentBalance: providerAccount.currentBalance,
          availableBalance: providerAccount.availableBalance,
          institutionName: providerAccount.institutionName,
          holderName: providerAccount.holderName,
          iban: providerAccount.iban,
          bban: providerAccount.bban,
          credentialsId: providerAccount.credentialsId,
          lastSyncedAt: now,
          archivedAt: undefined,
          updatedAt: now
        });
        updatedCount += 1;
        upsertedAccounts.push({
          providerAccountId: providerAccount.providerAccountId,
          accountId: existing._id
        });
      } else {
        const accountId = await ctx.db.insert("accounts", {
          userId: user._id,
          source: "local_bank",
          bankKey: providerAccount.bankKey,
          providerAccountId: providerAccount.providerAccountId,
          name: providerAccount.name,
          currency: providerAccount.currency,
          type: providerAccount.type,
          currentBalance: providerAccount.currentBalance,
          availableBalance: providerAccount.availableBalance,
          institutionName: providerAccount.institutionName,
          holderName: providerAccount.holderName,
          iban: providerAccount.iban,
          bban: providerAccount.bban,
          credentialsId: providerAccount.credentialsId,
          lastSyncedAt: now,
          createdAt: now,
          updatedAt: now
        });
        createdCount += 1;
        upsertedAccounts.push({
          providerAccountId: providerAccount.providerAccountId,
          accountId
        });
      }
    }

    const connection = await ctx.db
      .query("providerConnections")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", user._id).eq("provider", args.provider)
      )
      .unique();

    if (connection) {
      await ctx.db.patch(connection._id, {
        status: "connected",
        lastSyncedAt: now,
        lastSyncStatus: "success",
        lastError: undefined,
        updatedAt: now
      });
    }

    await ctx.db.insert("consentEvents", {
      userId: user._id,
      type: "provider_sync",
      status: "granted",
      metadata: {
        provider: args.provider,
        resource: "accounts",
        createdCount: String(createdCount),
        updatedCount: String(updatedCount)
      },
      createdAt: now
    });

    return {
      createdCount,
      updatedCount,
      upsertedAccounts
    };
  }
});

export const apiInsertBalanceSnapshot = mutation({
  args: {
    apiSecret: v.string(),
    accountId: v.id("accounts"),
    snapshotDate: v.string(),
    bookedBalance: v.number(),
    availableBalance: v.optional(v.number()),
    currency: currencyCode
  },
  handler: async (ctx, args) => {
    verifyApiSecret(args.apiSecret);

    const account = await ctx.db.get(args.accountId);
    if (!account) {
      throw new Error("Account not found");
    }

    if (!Number.isFinite(args.bookedBalance)) {
      throw new Error("Snapshot balance must be a valid number");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.snapshotDate)) {
      throw new Error("Snapshot date must be YYYY-MM-DD");
    }

    const existing = await ctx.db
      .query("balanceSnapshots")
      .withIndex("by_account_date", (q) =>
        q.eq("accountId", args.accountId).eq("snapshotDate", args.snapshotDate)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        bookedBalance: args.bookedBalance,
        availableBalance: args.availableBalance,
        currency: args.currency
      });
      return { created: false };
    }

    await ctx.db.insert("balanceSnapshots", {
      userId: account.userId,
      accountId: args.accountId,
      snapshotDate: args.snapshotDate,
      bookedBalance: args.bookedBalance,
      availableBalance: args.availableBalance,
      currency: args.currency,
      createdAt: Date.now()
    });

    return { created: true };
  }
});

function validateAccount(name: string, currentBalance: number) {
  if (name.trim().length === 0) {
    throw new Error("Account name is required");
  }

  if (!Number.isFinite(currentBalance)) {
    throw new Error("Account balance must be a valid number");
  }
}

async function getOrCreateUserByClerkId(
  ctx: Parameters<typeof getOrCreateCurrentUser>[0],
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
