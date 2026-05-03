import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const currencyCode = v.union(
  v.literal("HUF"),
  v.literal("EUR"),
  v.literal("USD"),
  v.literal("GBP")
);

const countryCode = v.union(v.literal("HU"), v.literal("FR"));

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
    name: v.string(),
    currency: currencyCode,
    type: accountType,
    currentBalance: v.number(),
    lastSyncedAt: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("by_user_id", ["userId"]),

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
    type: transactionType,
    isRecurring: v.boolean(),
    isExcludedFromReports: v.boolean(),
    dedupeHash: v.string(),
    notes: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_user_id", ["userId"])
    .index("by_account_id", ["accountId"])
    .index("by_dedupe_hash", ["dedupeHash"]),

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

  consentEvents: defineTable({
    userId: v.id("users"),
    type: v.union(
      v.literal("wise_connection"),
      v.literal("bank_import"),
      v.literal("data_export"),
      v.literal("data_deletion")
    ),
    status: v.union(v.literal("granted"), v.literal("revoked")),
    metadata: v.optional(v.record(v.string(), v.string())),
    createdAt: v.number()
  }).index("by_user_id", ["userId"])
});
