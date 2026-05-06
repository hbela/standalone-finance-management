import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const currencyCode = v.union(
  v.literal("HUF"),
  v.literal("EUR"),
  v.literal("USD"),
  v.literal("GBP")
);

const countryCode = v.union(v.literal("HU"), v.literal("FR"), v.literal("GB"));

const accountSource = v.union(
  v.literal("local_bank"),
  v.literal("wise"),
  v.literal("manual")
);

const providerName = v.union(v.literal("tink"), v.literal("wise"));

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

const accountType = v.union(
  v.literal("checking"),
  v.literal("savings"),
  v.literal("credit"),
  v.literal("loan"),
  v.literal("mortgage"),
  v.literal("wise_balance"),
  v.literal("cash")
);

const transactionType = v.union(
  v.literal("expense"),
  v.literal("income"),
  v.literal("transfer"),
  v.literal("loan_payment"),
  v.literal("mortgage_payment"),
  v.literal("fee"),
  v.literal("refund")
);

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    country: countryCode,
    locale: v.string(),
    baseCurrency: currencyCode,
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("by_clerk_user_id", ["clerkUserId"]),

  banks: defineTable({
    key: v.string(),
    name: v.string(),
    country: countryCode,
    logoUrl: v.optional(v.string()),
    supportedCurrencies: v.array(currencyCode),
    connectionMethods: v.array(
      v.union(v.literal("manual"), v.literal("csv"), v.literal("provider"))
    ),
    providerKey: v.optional(v.string())
  }).index("by_country", ["country"]),

  accounts: defineTable({
    userId: v.id("users"),
    source: accountSource,
    bankId: v.optional(v.id("banks")),
    bankKey: v.optional(v.string()),
    providerAccountId: v.optional(v.string()),
    credentialsId: v.optional(v.string()),
    name: v.string(),
    currency: currencyCode,
    type: accountType,
    currentBalance: v.number(),
    availableBalance: v.optional(v.number()),
    institutionName: v.optional(v.string()),
    holderName: v.optional(v.string()),
    iban: v.optional(v.string()),
    bban: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("by_user_id", ["userId"]),

  balanceSnapshots: defineTable({
    userId: v.id("users"),
    accountId: v.id("accounts"),
    snapshotDate: v.string(),
    bookedBalance: v.number(),
    availableBalance: v.optional(v.number()),
    currency: currencyCode,
    createdAt: v.number()
  })
    .index("by_account_date", ["accountId", "snapshotDate"])
    .index("by_user_id", ["userId"]),

  transactions: defineTable({
    userId: v.id("users"),
    accountId: v.id("accounts"),
    source: accountSource,
    providerTransactionId: v.optional(v.string()),
    postedAt: v.number(),
    amount: v.number(),
    currency: currencyCode,
    baseCurrencyAmount: v.optional(v.number()),
    description: v.string(),
    merchant: v.optional(v.string()),
    categoryId: v.optional(v.string()),
    importBatchId: v.optional(v.id("importBatches")),
    type: transactionType,
    isRecurring: v.boolean(),
    isExcludedFromReports: v.boolean(),
    transferMatchId: v.optional(v.id("transactions")),
    dedupeHash: v.string(),
    status: v.optional(v.union(v.literal("booked"), v.literal("pending"))),
    notes: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_user_id", ["userId"])
    .index("by_account_id", ["accountId"])
    .index("by_import_batch_id", ["importBatchId"])
    .index("by_dedupe_hash", ["dedupeHash"]),

  importBatches: defineTable({
    userId: v.id("users"),
    accountId: v.id("accounts"),
    source: v.literal("csv"),
    status: v.union(v.literal("completed"), v.literal("reverted")),
    sourceName: v.optional(v.string()),
    rowCount: v.number(),
    importedCount: v.number(),
    skippedCount: v.number(),
    columnMapping: v.record(v.string(), v.string()),
    dateFormat: v.string(),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_user_id", ["userId"])
    .index("by_account_id", ["accountId"]),

  categories: defineTable({
    userId: v.id("users"),
    name: v.string(),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("by_user_id", ["userId"]),

  liabilities: defineTable({
    userId: v.id("users"),
    linkedAccountId: v.optional(v.id("accounts")),
    name: v.string(),
    institution: v.string(),
    type: v.union(
      v.literal("personal_loan"),
      v.literal("mortgage"),
      v.literal("student_loan"),
      v.literal("car_loan"),
      v.literal("credit_card_debt"),
      v.literal("other")
    ),
    currency: currencyCode,
    originalPrincipal: v.number(),
    outstandingBalance: v.number(),
    interestRate: v.number(),
    paymentAmount: v.number(),
    paymentFrequency: v.union(
      v.literal("weekly"),
      v.literal("biweekly"),
      v.literal("monthly"),
      v.literal("quarterly"),
      v.literal("yearly")
    ),
    nextDueDate: v.string(),
    rateType: v.union(v.literal("fixed"), v.literal("variable")),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("by_user_id", ["userId"]),

  wiseConnections: defineTable({
    userId: v.id("users"),
    wiseProfileId: v.optional(v.string()),
    status: v.union(
      v.literal("not_connected"),
      v.literal("pending"),
      v.literal("connected"),
      v.literal("sync_failed"),
      v.literal("disconnected")
    ),
    scopes: v.array(v.string()),
    tokenRef: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("by_user_id", ["userId"]),

  providerConnections: defineTable({
    userId: v.id("users"),
    provider: providerName,
    externalUserId: v.optional(v.string()),
    country: countryCode,
    status: providerConnectionStatus,
    scopes: v.array(v.string()),
    tokenRef: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
    lastSyncStatus: providerSyncStatus,
    lastError: v.optional(v.string()),
    lastErrorCode: v.optional(v.string()),
    consentExpiresAt: v.optional(v.number()),
    credentialsId: v.optional(v.string()),
    institutionName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_user_id", ["userId"])
    .index("by_user_provider", ["userId", "provider"]),

  tinkCredentials: defineTable({
    userId: v.id("users"),
    providerConnectionId: v.id("providerConnections"),
    credentialsId: v.string(),
    providerName: v.optional(v.string()),
    institutionName: v.optional(v.string()),
    status: v.union(
      v.literal("connected"),
      v.literal("reconnect_required"),
      v.literal("temporary_error"),
      v.literal("unknown")
    ),
    statusCode: v.optional(v.string()),
    statusUpdatedAt: v.optional(v.number()),
    consentExpiresAt: v.optional(v.number()),
    sessionExtendable: v.optional(v.boolean()),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_user_id", ["userId"])
    .index("by_provider_connection_id", ["providerConnectionId"])
    .index("by_credentials_id", ["credentialsId"]),

  providerTokens: defineTable({
    tokenRef: v.string(),
    userId: v.id("users"),
    provider: providerName,
    ciphertext: v.string(),
    iv: v.string(),
    authTag: v.string(),
    algorithm: v.literal("aes-256-gcm"),
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_token_ref", ["tokenRef"])
    .index("by_user_provider", ["userId", "provider"]),

  providerConnectionAttempts: defineTable({
    userId: v.id("users"),
    provider: providerName,
    country: countryCode,
    stateHash: v.string(),
    status: v.union(
      v.literal("started"),
      v.literal("completed"),
      v.literal("failed")
    ),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_user_id", ["userId"])
    .index("by_state_hash", ["stateHash"]),

  providerWebhookEvents: defineTable({
    provider: providerName,
    eventId: v.string(),
    eventType: v.string(),
    receivedAt: v.number(),
    processedAt: v.optional(v.number()),
    status: v.union(
      v.literal("received"),
      v.literal("processed"),
      v.literal("failed"),
      v.literal("ignored")
    ),
    errorMessage: v.optional(v.string()),
    payloadDigest: v.string(),
    externalUserId: v.optional(v.string()),
    credentialsId: v.optional(v.string())
  })
    .index("by_event_id", ["eventId"])
    .index("by_provider_received_at", ["provider", "receivedAt"]),

  consentEvents: defineTable({
    userId: v.id("users"),
    type: v.union(
      v.literal("wise_connection"),
      v.literal("provider_connection"),
      v.literal("provider_reconnect"),
      v.literal("provider_disconnect"),
      v.literal("provider_sync"),
      v.literal("bank_import"),
      v.literal("data_export"),
      v.literal("data_deletion")
    ),
    status: v.union(v.literal("granted"), v.literal("revoked")),
    metadata: v.optional(v.record(v.string(), v.string())),
    createdAt: v.number()
  }).index("by_user_id", ["userId"])
});
