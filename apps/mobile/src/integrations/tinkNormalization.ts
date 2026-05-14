import type { Currency, TransactionType } from "../data/types";
import type { AccountRow, TransactionRow } from "../db/mappers";
import { createTransactionDedupeHash } from "../utils/csvImport";
import { toBaseCurrency } from "../utils/finance";
import { mapTinkCategoryCode } from "./tinkCategoryMapping";

export type ConvertToBaseFn = (amount: number, currency: Currency) => number;
import {
  parseTinkAmountValue,
  type TinkAccount,
  type TinkTransaction,
} from "./tinkMobileClient";

const localUserId = "device-local-user";

export function normalizeTinkAccounts(accounts: TinkAccount[], now: number) {
  const normalized: AccountRow[] = [];
  let skippedCount = 0;

  for (const account of accounts) {
    const currency = normalizeCurrency(
      account.currencyCode ??
        account.balances?.booked?.amount?.currencyCode ??
        account.balances?.booked?.currencyCode ??
        account.balance?.amount?.currencyCode ??
        account.balance?.currencyCode
    );

    if (!account.id || !currency) {
      skippedCount += 1;
      continue;
    }

    const availableBalance = parseTinkAmountValue(account.balances?.available);
    const { iban, bban } = extractAccountIdentifiers(account.identifiers);
    const holderName =
      account.holderName?.trim() ||
      account.holders?.find((holder) => holder.name?.trim())?.name?.trim() ||
      null;
    const credentialsId = account.credentialsId?.trim() || account.credentials?.id?.trim() || null;
    const institutionName = account.financialInstitutionName?.trim() || null;

    normalized.push({
      id: toLocalProviderId("tink-account", account.id),
      userId: localUserId,
      source: "local_bank",
      bankId: institutionName ? `tink:${slugify(institutionName)}` : null,
      bankKey: institutionName ? `tink:${slugify(institutionName)}` : null,
      providerAccountId: account.id,
      credentialsId,
      name: account.name?.trim() || institutionName || "Connected bank account",
      currency,
      type: normalizeAccountType(account.type),
      currentBalance:
        parseTinkAmountValue(account.balances?.booked) ??
        parseTinkAmountValue(account.balance) ??
        0,
      availableBalance: availableBalance ?? null,
      institutionName,
      holderName,
      iban,
      bban,
      lastSyncedAt: now,
      archivedAt: null,
      createdAt: now,
      updatedAt: now
    });
  }

  return { accounts: normalized, skippedCount };
}

export function normalizeTinkTransactions(
  transactions: TinkTransaction[],
  accountIdByProviderId: Map<string, string>,
  now: number,
  convertToBase: ConvertToBaseFn = toBaseCurrency
) {
  const normalized: TransactionRow[] = [];
  let skippedCount = 0;
  const skipReasons: Record<string, number> = {};

  for (const transaction of transactions) {
    const providerAccountId = transaction.accountId ?? transaction.account?.id;
    const accountId = providerAccountId ? accountIdByProviderId.get(providerAccountId) : undefined;
    const amount = parseTinkAmountValue(transaction.amount);
    const rawCurrency =
      transaction.currencyCode ??
      (typeof transaction.amount === "object"
        ? transaction.amount?.amount?.currencyCode ?? transaction.amount?.currencyCode
        : undefined);
    const currency = normalizeCurrency(rawCurrency);
    const postedAt = parseTinkDate(
      transaction.dates?.booked ?? transaction.bookedDate ?? transaction.dates?.value
    );
    const description =
      transaction.descriptions?.display ??
      transaction.description ??
      transaction.reference ??
      "Tink transaction";

    const skipReasonsForThis = [
      !transaction.id ? "missing_id" : null,
      !providerAccountId ? "missing_provider_account_id" : null,
      providerAccountId && !accountId ? "unknown_provider_account_id" : null,
      amount === null ? "unparseable_amount" : null,
      !currency ? `unsupported_currency:${rawCurrency ?? "none"}` : null,
      postedAt === null ? "unparseable_date" : null,
    ].filter((reason): reason is string => Boolean(reason));

    if (skipReasonsForThis.length > 0) {
      skippedCount += 1;
      for (const reason of skipReasonsForThis) {
        skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
      }
      continue;
    }

    if (!transaction.id || !providerAccountId || !accountId || amount === null || !currency || postedAt === null) {
      continue;
    }

    const merchant =
      transaction.merchantInformation?.merchantName ?? transaction.merchantName ?? description;
    const { categoryId, tinkCategoryCode } = mapTinkCategoryCode(transaction.category);
    const postedDate = new Date(postedAt).toISOString().slice(0, 10);

    normalized.push({
      id: toLocalProviderId("tink-transaction", transaction.id),
      userId: localUserId,
      accountId,
      source: "local_bank",
      providerTransactionId: transaction.id,
      postedAt,
      amount,
      currency,
      baseCurrencyAmount: convertToBase(amount, currency),
      description,
      merchant,
      categoryId: categoryId ?? "Other",
      tinkCategoryCode: tinkCategoryCode ?? null,
      importBatchId: null,
      type: normalizeTransactionType(amount, transaction.category),
      isRecurring: false,
      recurringGroupId: null,
      isExcludedFromReports: false,
      transferMatchId: null,
      dedupeHash: createTransactionDedupeHash({
        accountId,
        postedAt: postedDate,
        amount,
        currency,
        description,
        merchant
      }),
      status: transaction.status?.toLowerCase() === "pending" ? "pending" : "booked",
      notes: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now
    });
  }

  return { transactions: normalized, skippedCount, skipReasons };
}

export function getDefaultTransactionWindow(now: number) {
  const to = new Date(now);
  const from = new Date(now);
  from.setUTCFullYear(from.getUTCFullYear() - 2);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10)
  };
}

function extractAccountIdentifiers(identifiers: TinkAccount["identifiers"]) {
  if (!identifiers || typeof identifiers !== "object") {
    return { iban: null, bban: null };
  }

  if (Array.isArray(identifiers)) {
    let iban: string | null = null;
    let bban: string | null = null;

    for (const identifier of identifiers) {
      const scheme = identifier.scheme?.toLowerCase() ?? identifier.type?.toLowerCase();
      const ibanCandidate = typeof identifier.iban === "string" ? identifier.iban : identifier.iban?.iban;
      const bbanCandidate = typeof identifier.bban === "string" ? identifier.bban : identifier.bban?.bban;

      if (!iban && (scheme === "iban" || ibanCandidate)) {
        iban = (ibanCandidate ?? identifier.value ?? "").trim() || null;
      }

      if (!bban && (scheme === "bban" || bbanCandidate)) {
        bban = (bbanCandidate ?? identifier.value ?? "").trim() || null;
      }
    }

    return { iban, bban };
  }

  return {
    iban: readNestedIdentifier(identifiers.iban, "iban"),
    bban: readNestedIdentifier(identifiers.bban, "bban"),
  };
}

function readNestedIdentifier(
  value: string | { iban?: string; bban?: string } | undefined,
  key: "iban" | "bban"
): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  const nested = value[key];
  return typeof nested === "string" && nested.trim() ? nested.trim() : null;
}

function normalizeCurrency(value: string | undefined): Currency | null {
  const currency = value?.toUpperCase();
  if (currency === "HUF" || currency === "EUR" || currency === "USD" || currency === "GBP") {
    return currency;
  }
  return null;
}

function normalizeAccountType(value: string | undefined): AccountRow["type"] {
  const type = value?.toLowerCase() ?? "";
  if (type.includes("saving")) return "savings";
  if (type.includes("credit") || type.includes("card")) return "credit";
  if (type.includes("mortgage")) return "mortgage";
  if (type.includes("loan")) return "loan";
  return "checking";
}

function normalizeTransactionType(amount: number, category: string | undefined): TransactionType {
  const normalizedCategory = category?.toLowerCase() ?? "";
  if (normalizedCategory.includes("fee")) return "fee";
  if (amount > 0 && normalizedCategory.includes("refund")) return "refund";
  if (normalizedCategory.includes("transfer")) return "transfer";
  return amount < 0 ? "expense" : "income";
}

function parseTinkDate(value: string | undefined) {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function toLocalProviderId(prefix: string, providerId: string) {
  return `${prefix}-${providerId.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
