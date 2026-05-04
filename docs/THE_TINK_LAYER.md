
# THE TINK LAYER.md

Yes. Think of it this way:

**Wise = money movement / multi-currency wallet provider**
**Tink = bank aggregation / open banking provider**
**Your app = unified finance layer + ledger**

Tink uses OAuth-style user authorization via Tink Link to connect users to their banks and access products/APIs such as account and transaction data. ([docs.tink.com][1])

---

## 1. Target architecture

```txt
Expo App
  ↓
Fastify API
  ↓
Provider Layer
  ├── WiseProvider
  │     ├── balances
  │     ├── transfers
  │     └── statements
  │
  └── TinkProvider
        ├── bank connections
        ├── accounts
        ├── balances
        └── transactions

  ↓
Normalized Ledger Core
  ├── accounts
  ├── institutions
  ├── external_accounts
  ├── transactions
  ├── ledger_entries
  └── sync_runs
```

---

## 2. Provider abstraction

```ts
export type ProviderName = 'wise' | 'tink';

export interface BankProvider {
  name: ProviderName;

  listAccounts(userId: string): Promise<NormalizedAccount[]>;

  listTransactions(params: {
    userId: string;
    accountId: string;
    from?: string;
    to?: string;
  }): Promise<NormalizedTransaction[]>;

  refreshConnection?(userId: string): Promise<void>;
}
```

---

## 3. Normalized models

```ts
export type NormalizedAccount = {
  provider: 'wise' | 'tink';
  externalAccountId: string;
  institutionName?: string;
  name: string;
  currency: string;
  type: 'checking' | 'savings' | 'card' | 'wallet' | 'investment' | 'loan';
  balance?: string;
};

export type NormalizedTransaction = {
  provider: 'wise' | 'tink';
  externalTransactionId: string;
  externalAccountId: string;
  amount: string;
  currency: string;
  description: string;
  bookedAt: string;
  pending: boolean;
  merchantName?: string;
  category?: string;
};
```

---

## 4. Drizzle schema extension for Tink + Wise

```ts
import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  numeric,
  boolean,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core';

export const institutions = pgTable('institutions', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: varchar('provider', { length: 30 }).notNull(), // tink, wise
  externalInstitutionId: text('external_institution_id'),
  name: text('name').notNull(),
  country: varchar('country', { length: 2 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const providerConnections = pgTable(
  'provider_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),

    provider: varchar('provider', { length: 30 }).notNull(), // tink, wise

    // Tink user id / Wise profile id
    externalUserId: text('external_user_id'),

    accessTokenEncrypted: text('access_token_encrypted'),
    refreshTokenEncrypted: text('refresh_token_encrypted'),

    expiresAt: timestamp('expires_at'),
    status: varchar('status', { length: 30 }).notNull().default('active'),
    scopes: jsonb('scopes'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    userProviderIdx: uniqueIndex('provider_connections_user_provider_idx')
      .on(t.userId, t.provider),
  }),
);

export const externalAccounts = pgTable(
  'external_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),

    provider: varchar('provider', { length: 30 }).notNull(),
    providerConnectionId: uuid('provider_connection_id')
      .references(() => providerConnections.id),

    institutionId: uuid('institution_id')
      .references(() => institutions.id),

    externalAccountId: text('external_account_id').notNull(),

    name: text('name').notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),

    currentBalance: numeric('current_balance', {
      precision: 20,
      scale: 6,
    }),

    availableBalance: numeric('available_balance', {
      precision: 20,
      scale: 6,
    }),

    lastSyncedAt: timestamp('last_synced_at'),
    raw: jsonb('raw'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    providerAccountIdx: uniqueIndex('external_accounts_provider_account_idx')
      .on(t.provider, t.externalAccountId),
  }),
);

export const externalTransactions = pgTable(
  'external_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),

    provider: varchar('provider', { length: 30 }).notNull(),
    externalTransactionId: text('external_transaction_id').notNull(),
    externalAccountId: text('external_account_id').notNull(),

    amount: numeric('amount', { precision: 20, scale: 6 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),

    description: text('description').notNull(),
    merchantName: text('merchant_name'),
    category: text('category'),

    bookedAt: timestamp('booked_at').notNull(),
    pending: boolean('pending').default(false).notNull(),

    ledgerTransactionId: uuid('ledger_transaction_id'),

    raw: jsonb('raw'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    providerTxIdx: uniqueIndex('external_transactions_provider_tx_idx')
      .on(t.provider, t.externalTransactionId),
  }),
);

export const syncRuns = pgTable('sync_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  provider: varchar('provider', { length: 30 }).notNull(),

  status: varchar('status', { length: 30 }).notNull(), // running, success, failed
  startedAt: timestamp('started_at').defaultNow().notNull(),
  finishedAt: timestamp('finished_at'),

  accountsSynced: numeric('accounts_synced').default('0'),
  transactionsSynced: numeric('transactions_synced').default('0'),

  errorMessage: text('error_message'),
});
```

---

## 5. Tink OAuth / Link flow

Tink Link handles the end-user bank authorization flow and consent, using OAuth 2.0 methods. ([docs.tink.com][1])

```txt
1. Mobile app asks your API for Tink Link URL
2. API creates authorization/session URL
3. User connects bank through Tink Link
4. Tink redirects back with authorization code
5. Your backend exchanges code for tokens
6. Store encrypted tokens
7. Sync accounts + transactions
```

Fastify routes:

```ts
app.get('/integrations/tink/link', {
  preHandler: [app.authenticate],
}, async (req) => {
  const userId = req.user.id;

  const url = await tinkService.createLinkUrl({
    userId,
    redirectUri: `${process.env.API_URL}/integrations/tink/callback`,
  });

  return { url };
});

app.get('/integrations/tink/callback', async (req, reply) => {
  const { code, state } = req.query as {
    code: string;
    state: string;
  };

  await tinkService.exchangeCodeAndStoreConnection({
    code,
    state,
  });

  return reply.redirect(`${process.env.APP_URL}/bank-connected`);
});
```

---

## 6. Tink client

```ts
import axios from 'axios';

export const tinkClient = axios.create({
  baseURL: 'https://api.tink.com',
  headers: {
    'Content-Type': 'application/json',
  },
});

export function withTinkToken(accessToken: string) {
  return axios.create({
    baseURL: 'https://api.tink.com',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
}
```

---

## 7. Tink provider implementation

Tink exposes account and financial data APIs through its API platform. ([docs.tink.com][2])

```ts
export class TinkProvider implements BankProvider {
  name = 'tink' as const;

  async listAccounts(userId: string): Promise<NormalizedAccount[]> {
    const connection = await getConnection(userId, 'tink');
    const client = withTinkToken(connection.accessToken);

    const res = await client.get('/data/v2/accounts');

    return res.data.accounts.map((account: any) => ({
      provider: 'tink',
      externalAccountId: account.id,
      institutionName: account.financialInstitutionName,
      name: account.name,
      currency: account.currencyCode,
      type: mapTinkAccountType(account.type),
      balance: account.balances?.booked?.amount?.value,
    }));
  }

  async listTransactions(params: {
    userId: string;
    accountId: string;
    from?: string;
    to?: string;
  }): Promise<NormalizedTransaction[]> {
    const connection = await getConnection(params.userId, 'tink');
    const client = withTinkToken(connection.accessToken);

    const res = await client.get('/data/v2/transactions', {
      params: {
        accountId: params.accountId,
        from: params.from,
        to: params.to,
      },
    });

    return res.data.transactions.map((tx: any) => ({
      provider: 'tink',
      externalTransactionId: tx.id,
      externalAccountId: tx.accountId,
      amount: tx.amount.value,
      currency: tx.amount.currencyCode,
      description: tx.descriptions?.display || tx.reference || 'Transaction',
      bookedAt: tx.dates?.booked,
      pending: tx.status === 'PENDING',
      merchantName: tx.merchantInformation?.merchantName,
      category: tx.category,
    }));
  }
}
```

---

## 8. Shared sync service

```ts
export class ProviderSyncService {
  constructor(
    private providers: Record<'wise' | 'tink', BankProvider>,
    private ledgerService: LedgerService,
  ) {}

  async syncProvider(userId: string, providerName: 'wise' | 'tink') {
    const provider = this.providers[providerName];

    const accounts = await provider.listAccounts(userId);

    for (const account of accounts) {
      await upsertExternalAccount(userId, account);
    }

    for (const account of accounts) {
      const txs = await provider.listTransactions({
        userId,
        accountId: account.externalAccountId,
      });

      for (const tx of txs) {
        const saved = await upsertExternalTransaction(userId, tx);

        if (!saved.ledgerTransactionId && !tx.pending) {
          const ledgerTx = await this.ledgerService.importExternalTransaction({
            userId,
            source: providerName,
            externalTransaction: tx,
          });

          await linkExternalToLedger(saved.id, ledgerTx.id);
        }
      }
    }
  }
}
```

---

## 9. Ledger import logic

```ts
async importExternalTransaction(input: {
  userId: string;
  source: 'wise' | 'tink';
  externalTransaction: NormalizedTransaction;
}) {
  const tx = input.externalTransaction;

  const assetAccount = await findOrCreateAssetAccount({
    userId: input.userId,
    provider: input.source,
    externalAccountId: tx.externalAccountId,
    currency: tx.currency,
  });

  const categoryAccount = await findOrCreateCategoryAccount({
    userId: input.userId,
    category: tx.category ?? 'uncategorized',
    currency: tx.currency,
  });

  return this.createBalancedTransaction({
    userId: input.userId,
    type: Number(tx.amount) < 0 ? 'expense' : 'income',
    description: tx.description,
    externalReference: tx.externalTransactionId,
    entries: Number(tx.amount) < 0
      ? [
          {
            accountId: categoryAccount.id,
            direction: 'debit',
            amount: Math.abs(Number(tx.amount)).toString(),
            currency: tx.currency,
          },
          {
            accountId: assetAccount.id,
            direction: 'credit',
            amount: Math.abs(Number(tx.amount)).toString(),
            currency: tx.currency,
          },
        ]
      : [
          {
            accountId: assetAccount.id,
            direction: 'debit',
            amount: tx.amount,
            currency: tx.currency,
          },
          {
            accountId: categoryAccount.id,
            direction: 'credit',
            amount: tx.amount,
            currency: tx.currency,
          },
        ],
  });
}
```

---

## 10. API endpoints

```txt
POST /integrations/tink/link
GET  /integrations/tink/callback
POST /integrations/tink/sync
GET  /integrations/tink/accounts
GET  /integrations/tink/transactions

POST /integrations/wise/sync
GET  /integrations/wise/accounts
GET  /integrations/wise/transactions
POST /integrations/wise/transfers

GET  /accounts
GET  /transactions
GET  /ledger/balances
```

---

## 11. Important product distinction

Use **Tink** when you want:

```txt
User connects OTP / Erste / K&H / Revolut / other banks
↓
You read balances and transactions
↓
You categorize and reconcile
```

Use **Wise** when you want:

```txt
User has Wise profile / business account
↓
You read Wise balances
↓
You initiate transfers / FX flows
```

Tink can also support payment initiation products, but payment flows require much more care around consent, SCA, state handling, and compliance. Tink’s payment API area includes payment requests and transfers for payment requests. ([docs.tink.com][3])

---

## 12. Recommended MVP integration order

For your finance app, I would build it in this order:

```txt
Phase 1:
Tink account connection
Tink account sync
Tink transaction sync
Ledger import

Phase 2:
Wise account sync
Wise statements sync
Multi-currency ledger

Phase 3:
Wise transfers
FX conversion tracking
Reconciliation

Phase 4:
Tink payment initiation
Bank-to-bank payments
Compliance review
```

The key point: **Tink feeds your ledger; Wise can both feed and move money.**

[1]: https://docs.tink.com/entries/articles/tink-link-web-api-reference-transactions?utm_source=chatgpt.com "Tink Link Reference (Transactions)"
[2]: https://docs.tink.com/api?utm_source=chatgpt.com "Tink API"
[3]: https://docs.tink.com/api-payment?utm_source=chatgpt.com "api/v1/payments/requests/{id}"


Yes — **if you use Convex, you probably do not need Drizzle**.

Use:

```txt
Convex schema.ts     instead of Drizzle schema
Convex mutations     instead of SQL inserts/updates
Convex queries       instead of SQL selects
Convex actions       for Wise/Tink API calls
Convex scheduled jobs for sync/reconciliation
```

Convex schemas give type-safe document validation, mutations handle writes, actions are intended for third-party APIs, and scheduled functions can run sync/reconciliation workflows. ([docs.convex.dev][1])

## Revised architecture

```txt
Expo App
  ↓
Convex Client
  ↓
Convex Backend
  ├── queries
  ├── mutations
  ├── actions
  │     ├── Wise API
  │     └── Tink API
  └── scheduled functions
        └── sync + reconciliation
```

## Convex ledger tables

```ts
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  providerConnections: defineTable({
    userId: v.string(),
    provider: v.union(v.literal("wise"), v.literal("tink")),
    externalUserId: v.optional(v.string()),
    accessTokenEncrypted: v.optional(v.string()),
    refreshTokenEncrypted: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    status: v.union(
      v.literal("active"),
      v.literal("expired"),
      v.literal("revoked"),
      v.literal("error")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user_provider", ["userId", "provider"]),

  externalAccounts: defineTable({
    userId: v.string(),
    provider: v.union(v.literal("wise"), v.literal("tink")),
    connectionId: v.id("providerConnections"),

    externalAccountId: v.string(),
    institutionName: v.optional(v.string()),
    name: v.string(),

    type: v.union(
      v.literal("checking"),
      v.literal("savings"),
      v.literal("card"),
      v.literal("wallet"),
      v.literal("investment"),
      v.literal("loan")
    ),

    currency: v.string(),
    currentBalanceMinor: v.optional(v.number()),
    availableBalanceMinor: v.optional(v.number()),

    lastSyncedAt: v.optional(v.number()),
    raw: v.optional(v.any()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_provider_external", ["provider", "externalAccountId"]),

  externalTransactions: defineTable({
    userId: v.string(),
    provider: v.union(v.literal("wise"), v.literal("tink")),

    externalTransactionId: v.string(),
    externalAccountId: v.string(),

    amountMinor: v.number(),
    currency: v.string(),

    description: v.string(),
    merchantName: v.optional(v.string()),
    category: v.optional(v.string()),

    bookedAt: v.number(),
    pending: v.boolean(),

    ledgerTransactionId: v.optional(v.id("ledgerTransactions")),
    raw: v.optional(v.any()),

    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_provider_external", ["provider", "externalTransactionId"])
    .index("by_account", ["provider", "externalAccountId"]),

  ledgerAccounts: defineTable({
    userId: v.string(),

    name: v.string(),
    currency: v.string(),

    kind: v.union(
      v.literal("asset"),
      v.literal("expense"),
      v.literal("income"),
      v.literal("liability"),
      v.literal("equity"),
      v.literal("fx_clearing")
    ),

    provider: v.optional(v.union(v.literal("wise"), v.literal("tink"))),
    externalAccountId: v.optional(v.string()),

    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_external", ["provider", "externalAccountId"]),

  ledgerTransactions: defineTable({
    userId: v.string(),

    type: v.union(
      v.literal("income"),
      v.literal("expense"),
      v.literal("transfer"),
      v.literal("fx"),
      v.literal("fee"),
      v.literal("adjustment")
    ),

    description: v.string(),
    externalReference: v.optional(v.string()),

    status: v.union(
      v.literal("pending"),
      v.literal("posted"),
      v.literal("reversed")
    ),

    createdAt: v.number(),
    postedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_external_reference", ["externalReference"]),

  ledgerEntries: defineTable({
    userId: v.string(),
    transactionId: v.id("ledgerTransactions"),
    accountId: v.id("ledgerAccounts"),

    direction: v.union(v.literal("debit"), v.literal("credit")),
    amountMinor: v.number(),
    currency: v.string(),

    createdAt: v.number(),
  })
    .index("by_transaction", ["transactionId"])
    .index("by_account", ["accountId"])
    .index("by_user", ["userId"]),

  fxRates: defineTable({
    baseCurrency: v.string(),
    quoteCurrency: v.string(),
    rate: v.number(),
    source: v.optional(v.string()),
    timestamp: v.number(),
  }).index("by_pair_time", ["baseCurrency", "quoteCurrency", "timestamp"]),

  syncRuns: defineTable({
    userId: v.string(),
    provider: v.union(v.literal("wise"), v.literal("tink")),
    status: v.union(v.literal("running"), v.literal("success"), v.literal("failed")),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  }).index("by_user_provider", ["userId", "provider"]),
});
```

## Important Convex-specific adjustment

Use **minor units**, not floating decimals:

```ts
// Good
amountMinor: 12345 // €123.45

// Avoid
amount: 123.45
```

This avoids rounding bugs.

## Provider sync design

```txt
Convex action:
  fetch Wise/Tink API data

Convex internal mutation:
  upsert external accounts
  upsert external transactions
  create ledger transaction
  create balanced ledger entries
```

Actions should call third-party services; mutations should write to the DB. ([docs.convex.dev][2])

## Example: Tink sync action

```ts
// convex/tinkActions.ts
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

export const syncTink = action({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const accounts = await fetchTinkAccounts(userId);
    const transactions = await fetchTinkTransactions(userId);

    await ctx.runMutation(internal.tinkMutations.importTinkSnapshot, {
      userId,
      accounts,
      transactions,
    });
  },
});
```

## Example: ledger import mutation

```ts
// convex/ledgerMutations.ts
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const importExternalExpense = internalMutation({
  args: {
    userId: v.string(),
    externalTransactionId: v.string(),
    externalAccountId: v.string(),
    description: v.string(),
    amountMinor: v.number(),
    currency: v.string(),
  },
  handler: async (ctx, args) => {
    const ledgerTxId = await ctx.db.insert("ledgerTransactions", {
      userId: args.userId,
      type: "expense",
      description: args.description,
      externalReference: args.externalTransactionId,
      status: "posted",
      createdAt: Date.now(),
      postedAt: Date.now(),
    });

    const assetAccount = await findAssetAccount(ctx, args);
    const expenseAccount = await findOrCreateExpenseAccount(ctx, args);

    await ctx.db.insert("ledgerEntries", {
      userId: args.userId,
      transactionId: ledgerTxId,
      accountId: expenseAccount._id,
      direction: "debit",
      amountMinor: Math.abs(args.amountMinor),
      currency: args.currency,
      createdAt: Date.now(),
    });

    await ctx.db.insert("ledgerEntries", {
      userId: args.userId,
      transactionId: ledgerTxId,
      accountId: assetAccount._id,
      direction: "credit",
      amountMinor: Math.abs(args.amountMinor),
      currency: args.currency,
      createdAt: Date.now(),
    });

    return ledgerTxId;
  },
});
```

## Balance query

```ts
export const getAccountBalance = query({
  args: { accountId: v.id("ledgerAccounts") },
  handler: async (ctx, { accountId }) => {
    const entries = await ctx.db
      .query("ledgerEntries")
      .withIndex("by_account", q => q.eq("accountId", accountId))
      .collect();

    return entries.reduce((sum, entry) => {
      return entry.direction === "debit"
        ? sum + entry.amountMinor
        : sum - entry.amountMinor;
    }, 0);
  },
});
```

## My recommendation

For your stack:

```txt
Expo + Convex + Wise + Tink
```

Use Convex as:

```txt
Backend API
Database
Sync engine
Ledger storage
Realtime transaction UI
```

Skip:

```txt
Drizzle
Prisma
SQLite server schema
REST API for internal app data
```

Keep only one backend model. Convex is enough here.

[1]: https://docs.convex.dev/database/schemas?utm_source=chatgpt.com "Schemas | Convex Developer Hub"
[2]: https://docs.convex.dev/functions/actions?utm_source=chatgpt.com "Actions | Convex Developer Hub"



Strategic insight (very important)

This is why your architecture is correct:

Tink → for aggregation (all banks)
Wise → for money movement (reliable)
Your ledger → source of truth


👉 Tink gives you coverage
👉 Wise gives you control


Yes. Here is a clean production design for:

```txt
Convex + Tink + TrueLayer + Ledger
```

Tink and TrueLayer both provide bank-connection/auth flows and account/transaction APIs; Convex actions are a good fit for third-party API calls, while mutations handle database writes. ([docs.tink.com][1])

---

## 1. Core idea

Do **not** build:

```txt
App → Tink
App → TrueLayer
```

Build:

```txt
App
 ↓
Convex
 ↓
BankProvider abstraction
 ├── TinkProvider
 └── TrueLayerProvider
 ↓
Normalized external data
 ↓
Double-entry ledger
```

Your app should not care whether data came from Tink or TrueLayer.

---

## 2. Provider interface

```ts
// convex/lib/providers/types.ts

export type ProviderName = "tink" | "truelayer";

export type ProviderCapability =
  | "accounts"
  | "balances"
  | "transactions"
  | "identity"
  | "payments";

export type NormalizedAccount = {
  provider: ProviderName;
  externalAccountId: string;
  institutionId?: string;
  institutionName?: string;
  name: string;
  type: "checking" | "savings" | "card" | "wallet" | "loan" | "investment";
  currency: string;
  currentBalanceMinor?: number;
  availableBalanceMinor?: number;
  raw: unknown;
};

export type NormalizedTransaction = {
  provider: ProviderName;
  externalTransactionId: string;
  externalAccountId: string;
  amountMinor: number;
  currency: string;
  description: string;
  merchantName?: string;
  category?: string;
  bookedAt: number;
  pending: boolean;
  raw: unknown;
};

export interface BankProvider {
  name: ProviderName;
  capabilities: ProviderCapability[];

  createAuthUrl(input: {
    userId: string;
    redirectUri: string;
    state: string;
    country?: string;
    institutionHint?: string;
  }): Promise<string>;

  exchangeCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<{
    externalUserId?: string;
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
  }>;

  refreshToken?(input: {
    refreshToken: string;
  }): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
  }>;

  listAccounts(input: {
    accessToken: string;
  }): Promise<NormalizedAccount[]>;

  listTransactions(input: {
    accessToken: string;
    externalAccountId: string;
    from?: number;
    to?: number;
  }): Promise<NormalizedTransaction[]>;
}
```

---

## 3. Provider registry with priority

Use Tink first for Hungary/EU, then TrueLayer as fallback.

```ts
// convex/lib/providers/registry.ts

import { TinkProvider } from "./tinkProvider";
import { TrueLayerProvider } from "./trueLayerProvider";
import type { BankProvider, ProviderName, ProviderCapability } from "./types";

const providers: Record<ProviderName, BankProvider> = {
  tink: new TinkProvider(),
  truelayer: new TrueLayerProvider(),
};

const providerPriorityByCountry: Record<string, ProviderName[]> = {
  HU: ["tink", "truelayer"],
  DE: ["tink", "truelayer"],
  AT: ["tink", "truelayer"],
  NL: ["tink", "truelayer"],
  GB: ["truelayer", "tink"],
  IE: ["truelayer", "tink"],
};

export function getProvider(name: ProviderName) {
  return providers[name];
}

export function getProviderChain(input: {
  country: string;
  capability: ProviderCapability;
}) {
  const chain = providerPriorityByCountry[input.country] ?? ["tink", "truelayer"];

  return chain
    .map((name) => providers[name])
    .filter((provider) => provider.capabilities.includes(input.capability));
}
```

---

## 4. Convex schema additions

```ts
// convex/schema.ts

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  providerConnections: defineTable({
    userId: v.string(),

    provider: v.union(v.literal("tink"), v.literal("truelayer")),
    country: v.optional(v.string()),

    externalUserId: v.optional(v.string()),

    accessTokenEncrypted: v.optional(v.string()),
    refreshTokenEncrypted: v.optional(v.string()),
    expiresAt: v.optional(v.number()),

    status: v.union(
      v.literal("active"),
      v.literal("expired"),
      v.literal("revoked"),
      v.literal("error")
    ),

    lastError: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_provider", ["userId", "provider"]),

  connectionAttempts: defineTable({
    userId: v.string(),
    country: v.string(),

    preferredProvider: v.union(v.literal("tink"), v.literal("truelayer")),
    fallbackProvider: v.optional(v.union(v.literal("tink"), v.literal("truelayer"))),

    state: v.string(),
    status: v.union(
      v.literal("started"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("fallback_started")
    ),

    errorMessage: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_state", ["state"]),

  externalAccounts: defineTable({
    userId: v.string(),
    provider: v.union(v.literal("tink"), v.literal("truelayer")),
    connectionId: v.id("providerConnections"),

    externalAccountId: v.string(),
    institutionName: v.optional(v.string()),

    name: v.string(),
    type: v.union(
      v.literal("checking"),
      v.literal("savings"),
      v.literal("card"),
      v.literal("wallet"),
      v.literal("loan"),
      v.literal("investment")
    ),

    currency: v.string(),

    currentBalanceMinor: v.optional(v.number()),
    availableBalanceMinor: v.optional(v.number()),

    lastSyncedAt: v.optional(v.number()),
    raw: v.optional(v.any()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_provider_external", ["provider", "externalAccountId"]),

  externalTransactions: defineTable({
    userId: v.string(),

    provider: v.union(v.literal("tink"), v.literal("truelayer")),
    externalTransactionId: v.string(),
    externalAccountId: v.string(),

    amountMinor: v.number(),
    currency: v.string(),

    description: v.string(),
    merchantName: v.optional(v.string()),
    category: v.optional(v.string()),

    bookedAt: v.number(),
    pending: v.boolean(),

    ledgerTransactionId: v.optional(v.id("ledgerTransactions")),

    raw: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_provider_external", ["provider", "externalTransactionId"])
    .index("by_account", ["provider", "externalAccountId"]),

  ledgerAccounts: defineTable({
    userId: v.string(),

    name: v.string(),
    currency: v.string(),

    kind: v.union(
      v.literal("asset"),
      v.literal("expense"),
      v.literal("income"),
      v.literal("liability"),
      v.literal("equity"),
      v.literal("fx_clearing")
    ),

    provider: v.optional(v.union(v.literal("tink"), v.literal("truelayer"))),
    externalAccountId: v.optional(v.string()),

    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_external", ["provider", "externalAccountId"]),

  ledgerTransactions: defineTable({
    userId: v.string(),

    type: v.union(
      v.literal("income"),
      v.literal("expense"),
      v.literal("transfer"),
      v.literal("fx"),
      v.literal("fee"),
      v.literal("adjustment")
    ),

    status: v.union(
      v.literal("pending"),
      v.literal("posted"),
      v.literal("reversed")
    ),

    description: v.string(),
    externalReference: v.optional(v.string()),

    createdAt: v.number(),
    postedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_external_reference", ["externalReference"]),

  ledgerEntries: defineTable({
    userId: v.string(),

    transactionId: v.id("ledgerTransactions"),
    accountId: v.id("ledgerAccounts"),

    direction: v.union(v.literal("debit"), v.literal("credit")),
    amountMinor: v.number(),
    currency: v.string(),

    createdAt: v.number(),
  })
    .index("by_transaction", ["transactionId"])
    .index("by_account", ["accountId"]),

  syncRuns: defineTable({
    userId: v.string(),
    provider: v.union(v.literal("tink"), v.literal("truelayer")),

    status: v.union(
      v.literal("running"),
      v.literal("success"),
      v.literal("retry_scheduled"),
      v.literal("failed"),
      v.literal("fallback_used")
    ),

    attempt: v.number(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),

    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  })
    .index("by_user_provider", ["userId", "provider"])
    .index("by_status", ["status"]),
});
```

---

## 5. Auth flow with fallback

```ts
// convex/bankAuth.ts

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getProviderChain } from "./lib/providers/registry";

export const createBankConnectionUrl = action({
  args: {
    userId: v.string(),
    country: v.string(),
    redirectUri: v.string(),
  },
  handler: async (ctx, args) => {
    const providers = getProviderChain({
      country: args.country,
      capability: "transactions",
    });

    const primary = providers[0];
    const fallback = providers[1];

    const state = crypto.randomUUID();

    await ctx.runMutation(internal.bankMutations.createConnectionAttempt, {
      userId: args.userId,
      country: args.country,
      preferredProvider: primary.name,
      fallbackProvider: fallback?.name,
      state,
    });

    const url = await primary.createAuthUrl({
      userId: args.userId,
      country: args.country,
      redirectUri: args.redirectUri,
      state,
    });

    return {
      provider: primary.name,
      fallbackProvider: fallback?.name,
      url,
    };
  },
});
```

Tink uses Tink Link with OAuth-style authorization, while TrueLayer uses an auth link/Auth Dialog for account connection. ([docs.tink.com][1])

---

## 6. Callback handler

```ts
// convex/bankCallbacks.ts

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getProvider } from "./lib/providers/registry";

export const handleBankCallback = action({
  args: {
    provider: v.union(v.literal("tink"), v.literal("truelayer")),
    code: v.string(),
    state: v.string(),
    redirectUri: v.string(),
  },
  handler: async (ctx, args) => {
    const attempt = await ctx.runQuery(
      internal.bankQueries.getConnectionAttemptByState,
      { state: args.state }
    );

    if (!attempt) {
      throw new Error("Invalid connection state");
    }

    const provider = getProvider(args.provider);

    try {
      const tokens = await provider.exchangeCode({
        code: args.code,
        redirectUri: args.redirectUri,
      });

      await ctx.runMutation(internal.bankMutations.saveProviderConnection, {
        userId: attempt.userId,
        provider: args.provider,
        country: attempt.country,
        externalUserId: tokens.externalUserId,
        accessTokenEncrypted: await encrypt(tokens.accessToken),
        refreshTokenEncrypted: tokens.refreshToken
          ? await encrypt(tokens.refreshToken)
          : undefined,
        expiresAt: tokens.expiresAt,
      });

      await ctx.runMutation(internal.bankMutations.markAttemptCompleted, {
        state: args.state,
      });

      await ctx.scheduler.runAfter(0, internal.bankSync.syncProvider, {
        userId: attempt.userId,
        provider: args.provider,
      });

      return { ok: true };
    } catch (error) {
      await ctx.runMutation(internal.bankMutations.markAttemptFailed, {
        state: args.state,
        errorMessage: String(error),
      });

      throw error;
    }
  },
});
```

---

## 7. Retry + fallback policy

Use retries for temporary errors. Use fallback only when the user can reconnect through another provider.

```ts
// convex/lib/retryPolicy.ts

export type ProviderErrorType =
  | "rate_limited"
  | "temporary"
  | "auth_expired"
  | "institution_unavailable"
  | "unsupported_bank"
  | "permission_denied"
  | "unknown";

export function classifyProviderError(error: unknown): ProviderErrorType {
  const message = String(error).toLowerCase();

  if (message.includes("429") || message.includes("rate")) return "rate_limited";
  if (message.includes("timeout") || message.includes("503")) return "temporary";
  if (message.includes("401") || message.includes("expired")) return "auth_expired";
  if (message.includes("institution unavailable")) return "institution_unavailable";
  if (message.includes("unsupported")) return "unsupported_bank";
  if (message.includes("permission")) return "permission_denied";

  return "unknown";
}

export function getRetryDelayMs(attempt: number) {
  const base = 30_000;
  const max = 30 * 60_000;
  const jitter = Math.floor(Math.random() * 5_000);

  return Math.min(base * 2 ** attempt + jitter, max);
}

export function shouldRetry(errorType: ProviderErrorType, attempt: number) {
  if (attempt >= 5) return false;

  return errorType === "rate_limited" || errorType === "temporary";
}

export function shouldFallback(errorType: ProviderErrorType) {
  return (
    errorType === "institution_unavailable" ||
    errorType === "unsupported_bank" ||
    errorType === "unknown"
  );
}
```

---

## 8. Sync action with automatic retry

Convex scheduled functions can be triggered with `ctx.scheduler.runAfter`, which is ideal for retrying failed syncs with backoff. ([docs.convex.dev][2])

```ts
// convex/bankSync.ts

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getProvider } from "./lib/providers/registry";
import {
  classifyProviderError,
  getRetryDelayMs,
  shouldRetry,
} from "./lib/retryPolicy";

export const syncProvider = internalAction({
  args: {
    userId: v.string(),
    provider: v.union(v.literal("tink"), v.literal("truelayer")),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const attempt = args.attempt ?? 0;

    const syncRunId = await ctx.runMutation(internal.bankMutations.startSyncRun, {
      userId: args.userId,
      provider: args.provider,
      attempt,
    });

    try {
      const connection = await ctx.runQuery(
        internal.bankQueries.getActiveConnection,
        {
          userId: args.userId,
          provider: args.provider,
        }
      );

      if (!connection) {
        throw new Error("No active provider connection");
      }

      const accessToken = await decrypt(connection.accessTokenEncrypted);
      const provider = getProvider(args.provider);

      const accounts = await provider.listAccounts({ accessToken });

      await ctx.runMutation(internal.bankMutations.upsertExternalAccounts, {
        userId: args.userId,
        provider: args.provider,
        connectionId: connection._id,
        accounts,
      });

      for (const account of accounts) {
        const transactions = await provider.listTransactions({
          accessToken,
          externalAccountId: account.externalAccountId,
        });

        await ctx.runMutation(internal.bankMutations.upsertExternalTransactions, {
          userId: args.userId,
          provider: args.provider,
          transactions,
        });

        await ctx.runMutation(internal.ledgerMutations.importPostedTransactions, {
          userId: args.userId,
          provider: args.provider,
        });
      }

      await ctx.runMutation(internal.bankMutations.finishSyncRun, {
        syncRunId,
        status: "success",
      });
    } catch (error) {
      const errorType = classifyProviderError(error);

      if (shouldRetry(errorType, attempt)) {
        const delay = getRetryDelayMs(attempt);

        await ctx.runMutation(internal.bankMutations.finishSyncRun, {
          syncRunId,
          status: "retry_scheduled",
          errorCode: errorType,
          errorMessage: String(error),
        });

        await ctx.scheduler.runAfter(delay, internal.bankSync.syncProvider, {
          userId: args.userId,
          provider: args.provider,
          attempt: attempt + 1,
        });

        return;
      }

      await ctx.runMutation(internal.bankMutations.finishSyncRun, {
        syncRunId,
        status: "failed",
        errorCode: errorType,
        errorMessage: String(error),
      });

      throw error;
    }
  },
});
```

---

## 9. Fallback connection strategy

Important nuance: for bank aggregation, fallback is not usually “silent.” If Tink fails to connect OTP/K&H/Erste, the user usually must authorize the same bank again via TrueLayer.

So fallback should mean:

```txt
Tink connect failed
 ↓
Show “Try another secure connection method”
 ↓
Generate TrueLayer auth URL
 ↓
User authorizes bank again
 ↓
Sync data through TrueLayer
```

```ts
export const createFallbackConnectionUrl = action({
  args: {
    state: v.string(),
    redirectUri: v.string(),
  },
  handler: async (ctx, args) => {
    const attempt = await ctx.runQuery(
      internal.bankQueries.getConnectionAttemptByState,
      { state: args.state }
    );

    if (!attempt?.fallbackProvider) {
      throw new Error("No fallback provider available");
    }

    const provider = getProvider(attempt.fallbackProvider);
    const fallbackState = crypto.randomUUID();

    await ctx.runMutation(internal.bankMutations.createConnectionAttempt, {
      userId: attempt.userId,
      country: attempt.country,
      preferredProvider: attempt.fallbackProvider,
      state: fallbackState,
    });

    const url = await provider.createAuthUrl({
      userId: attempt.userId,
      country: attempt.country,
      redirectUri: args.redirectUri,
      state: fallbackState,
    });

    return {
      provider: attempt.fallbackProvider,
      url,
    };
  },
});
```

---

## 10. Ledger import mutation

```ts
// convex/ledgerMutations.ts

export const importPostedTransactions = internalMutation({
  args: {
    userId: v.string(),
    provider: v.union(v.literal("tink"), v.literal("truelayer")),
  },
  handler: async (ctx, args) => {
    const externalTxs = await ctx.db
      .query("externalTransactions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    for (const tx of externalTxs) {
      if (tx.provider !== args.provider) continue;
      if (tx.pending) continue;
      if (tx.ledgerTransactionId) continue;

      const existingLedgerTx = await ctx.db
        .query("ledgerTransactions")
        .withIndex("by_external_reference", (q) =>
          q.eq("externalReference", `${tx.provider}:${tx.externalTransactionId}`)
        )
        .unique();

      if (existingLedgerTx) continue;

      const assetAccount = await findOrCreateAssetLedgerAccount(ctx, {
        userId: args.userId,
        provider: tx.provider,
        externalAccountId: tx.externalAccountId,
        currency: tx.currency,
      });

      const categoryAccount = await findOrCreateCategoryLedgerAccount(ctx, {
        userId: args.userId,
        kind: tx.amountMinor < 0 ? "expense" : "income",
        category: tx.category ?? "Uncategorized",
        currency: tx.currency,
      });

      const ledgerTxId = await ctx.db.insert("ledgerTransactions", {
        userId: args.userId,
        type: tx.amountMinor < 0 ? "expense" : "income",
        status: "posted",
        description: tx.description,
        externalReference: `${tx.provider}:${tx.externalTransactionId}`,
        createdAt: Date.now(),
        postedAt: tx.bookedAt,
      });

      if (tx.amountMinor < 0) {
        await ctx.db.insert("ledgerEntries", {
          userId: args.userId,
          transactionId: ledgerTxId,
          accountId: categoryAccount._id,
          direction: "debit",
          amountMinor: Math.abs(tx.amountMinor),
          currency: tx.currency,
          createdAt: Date.now(),
        });

        await ctx.db.insert("ledgerEntries", {
          userId: args.userId,
          transactionId: ledgerTxId,
          accountId: assetAccount._id,
          direction: "credit",
          amountMinor: Math.abs(tx.amountMinor),
          currency: tx.currency,
          createdAt: Date.now(),
        });
      } else {
        await ctx.db.insert("ledgerEntries", {
          userId: args.userId,
          transactionId: ledgerTxId,
          accountId: assetAccount._id,
          direction: "debit",
          amountMinor: tx.amountMinor,
          currency: tx.currency,
          createdAt: Date.now(),
        });

        await ctx.db.insert("ledgerEntries", {
          userId: args.userId,
          transactionId: ledgerTxId,
          accountId: categoryAccount._id,
          direction: "credit",
          amountMinor: tx.amountMinor,
          currency: tx.currency,
          createdAt: Date.now(),
        });
      }

      await ctx.db.patch(tx._id, {
        ledgerTransactionId: ledgerTxId,
        updatedAt: Date.now(),
      });
    }
  },
});
```

---

## 11. Deduplication across providers

This is very important if the same bank account is connected through both Tink and TrueLayer.

Add a fingerprint:

```ts
function transactionFingerprint(input: {
  externalAccountId: string;
  amountMinor: number;
  currency: string;
  bookedAt: number;
  description: string;
}) {
  const day = new Date(input.bookedAt).toISOString().slice(0, 10);

  return [
    input.externalAccountId,
    input.amountMinor,
    input.currency,
    day,
    normalizeText(input.description),
  ].join("|");
}
```

Add field:

```ts
fingerprint: v.string()
```

Index:

```ts
.index("by_user_fingerprint", ["userId", "fingerprint"])
```

Then before ledger import:

```ts
const duplicate = await ctx.db
  .query("externalTransactions")
  .withIndex("by_user_fingerprint", q =>
    q.eq("userId", args.userId).eq("fingerprint", tx.fingerprint)
  )
  .first();

if (duplicate?.ledgerTransactionId) {
  await ctx.db.patch(tx._id, {
    ledgerTransactionId: duplicate.ledgerTransactionId,
    updatedAt: Date.now(),
  });
  continue;
}
```

---

## 12. UI flow in Expo

```txt
Connect bank
 ↓
Backend chooses primary provider
 ↓
Open Tink/TrueLayer auth URL
 ↓
Callback success
 ↓
Sync starts
 ↓
Show accounts + imported transactions
```

If failure:

```txt
Connection failed
 ↓
Show:
"Your bank connection failed. Try another secure connection method."
 ↓
Generate fallback provider URL
```

---

## 13. Recommended MVP implementation order

```txt
1. Convex schema
2. Provider interface
3. TinkProvider only
4. Sync accounts
5. Sync transactions
6. Ledger import
7. TrueLayerProvider
8. Fallback auth
9. Retry scheduling
10. Cross-provider deduplication
```

The key rule: **retry API failures automatically, but ask the user for consent again when switching provider.**

[1]: https://docs.tink.com/entries/articles/tink-link-web-api-reference-transactions?utm_source=chatgpt.com "Tink Link Reference (Transactions)"
[2]: https://docs.convex.dev/scheduling/scheduled-functions?utm_source=chatgpt.com "Scheduled Functions | Convex Developer Hub"
