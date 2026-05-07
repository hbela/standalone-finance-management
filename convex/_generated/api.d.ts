/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as banks from "../banks.js";
import type * as categories from "../categories.js";
import type * as expenseProfiles from "../expenseProfiles.js";
import type * as forecast from "../forecast.js";
import type * as importBatches from "../importBatches.js";
import type * as incomeStreams from "../incomeStreams.js";
import type * as liabilities from "../liabilities.js";
import type * as model from "../model.js";
import type * as providerConnections from "../providerConnections.js";
import type * as providerTokens from "../providerTokens.js";
import type * as providerWebhookEvents from "../providerWebhookEvents.js";
import type * as recurringSubscriptions from "../recurringSubscriptions.js";
import type * as tinkCredentials from "../tinkCredentials.js";
import type * as transactions from "../transactions.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  banks: typeof banks;
  categories: typeof categories;
  expenseProfiles: typeof expenseProfiles;
  forecast: typeof forecast;
  importBatches: typeof importBatches;
  incomeStreams: typeof incomeStreams;
  liabilities: typeof liabilities;
  model: typeof model;
  providerConnections: typeof providerConnections;
  providerTokens: typeof providerTokens;
  providerWebhookEvents: typeof providerWebhookEvents;
  recurringSubscriptions: typeof recurringSubscriptions;
  tinkCredentials: typeof tinkCredentials;
  transactions: typeof transactions;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
