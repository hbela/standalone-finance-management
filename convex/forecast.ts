import { v } from "convex/values";

import { query } from "./_generated/server";
import { getCurrentUser } from "./model";
import {
  computeBalanceForecast,
  type ForecastEvent,
  type ForecastResult
} from "../apps/api/src/balanceForecasting.js";

const currencyCode = v.union(
  v.literal("HUF"),
  v.literal("EUR"),
  v.literal("USD"),
  v.literal("GBP")
);

const EMPTY_RESULT: ForecastResult = {
  currency: "EUR",
  horizonDays: 30,
  startingBalance: 0,
  endingBalance: 0,
  totalInflow: 0,
  totalOutflow: 0,
  points: []
};

export const getBalanceForecast = query({
  args: {
    horizonDays: v.optional(v.number()),
    currency: v.optional(currencyCode)
  },
  handler: async (ctx, args): Promise<ForecastResult> => {
    const user = await getCurrentUser(ctx);
    if (!user) return EMPTY_RESULT;

    const targetCurrency = args.currency ?? user.baseCurrency;
    const horizonDays = args.horizonDays ?? 30;

    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("archivedAt"), undefined))
      .collect();
    const startingBalance = accounts
      .filter((account) => account.currency === targetCurrency)
      .reduce((sum, account) => sum + account.currentBalance, 0);

    const subscriptions = await ctx.db
      .query("recurringSubscriptions")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("archivedAt"), undefined))
      .collect();
    const outflows: ForecastEvent[] = subscriptions
      .filter((sub) => !sub.dismissedAt && sub.currency === targetCurrency && sub.nextExpectedAt)
      .map((sub) => ({
        amount: sub.averageAmount,
        currency: sub.currency,
        frequency: sub.frequency,
        nextExpectedAt: sub.nextExpectedAt as number
      }));

    const incomeStreams = await ctx.db
      .query("incomeStreams")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("archivedAt"), undefined))
      .collect();
    const inflows: ForecastEvent[] = incomeStreams
      .filter((stream) => !stream.dismissedAt && stream.currency === targetCurrency && stream.nextExpectedAt)
      .map((stream) => ({
        amount: stream.averageAmount,
        currency: stream.currency,
        frequency: stream.frequency,
        nextExpectedAt: stream.nextExpectedAt as number
      }));

    return computeBalanceForecast({
      startingBalance,
      currency: targetCurrency,
      now: Date.now(),
      horizonDays,
      inflows,
      outflows
    });
  }
});
