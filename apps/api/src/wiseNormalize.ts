import { toBaseCurrencyAmount, type FxSnapshot } from "./fxRates.js";
import type {
  WiseBalance,
  WiseProfile,
  WiseStatementTransaction
} from "./wiseClient.js";

export type SupportedCurrency = "HUF" | "EUR" | "USD" | "GBP";

export type NormalizedWiseAccount = {
  providerAccountId: string;
  bankKey: string;
  name: string;
  currency: SupportedCurrency;
  type: "wise_balance";
  currentBalance: number;
  availableBalance?: number;
  institutionName: string;
  holderName?: string;
  iban?: string;
  bban?: string;
  credentialsId?: string;
};

export type NormalizedWiseTransaction = {
  providerAccountId: string;
  providerTransactionId: string;
  postedAt: number;
  amount: number;
  currency: SupportedCurrency;
  baseCurrencyAmount: number;
  description: string;
  merchant?: string;
  categoryId?: string;
  tinkCategoryCode?: string;
  type: "expense" | "income" | "transfer" | "fee" | "refund";
  isRecurring: false;
  isExcludedFromReports: false;
  status: "booked" | "pending";
  dedupeHash: string;
};

export type WiseBalanceWithProfile = {
  profile: WiseProfile;
  balance: WiseBalance;
};

export type WiseStatementWithContext = WiseBalanceWithProfile & {
  transactions: WiseStatementTransaction[];
};

export function normalizeWiseAccounts(
  entries: WiseBalanceWithProfile[]
): { accounts: NormalizedWiseAccount[]; skippedCount: number; skipReasons: Record<string, number> } {
  const skipReasons: Record<string, number> = {};
  let skippedCount = 0;
  const accounts: NormalizedWiseAccount[] = [];

  for (const entry of entries) {
    const currency = normalizeCurrency(entry.balance.amount?.currency ?? entry.balance.currency);
    const balanceValue = entry.balance.amount?.value ?? entry.balance.cashAmount?.value;
    const reasonsForThis: string[] = [];
    if (!Number.isFinite(entry.balance.id)) reasonsForThis.push("missing_balance_id");
    if (!currency) reasonsForThis.push(`unsupported_currency:${entry.balance.amount?.currency ?? "none"}`);
    if (!Number.isFinite(balanceValue)) reasonsForThis.push("unparseable_balance");

    if (reasonsForThis.length > 0) {
      skippedCount += 1;
      for (const reason of reasonsForThis) {
        skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
      }
      continue;
    }

    if (!currency || !Number.isFinite(balanceValue)) continue;

    accounts.push({
      providerAccountId: String(entry.balance.id),
      bankKey: entry.profile.type === "BUSINESS" ? "wise:business" : "wise:personal",
      name: composeAccountName(entry, currency),
      currency,
      type: "wise_balance",
      currentBalance: balanceValue,
      availableBalance: entry.balance.cashAmount?.value,
      institutionName: "Wise",
      holderName: composeHolderName(entry.profile),
      iban: undefined,
      bban: undefined,
      credentialsId: undefined
    });
  }

  return { accounts, skippedCount, skipReasons };
}

export function normalizeWiseTransactions(
  statements: WiseStatementWithContext[],
  fxSnapshot: FxSnapshot,
  options: { dedupeProvider?: string } = {}
): { transactions: NormalizedWiseTransaction[]; skippedCount: number; skipReasons: Record<string, number> } {
  const provider = options.dedupeProvider ?? "wise";
  const skipReasons: Record<string, number> = {};
  let skippedCount = 0;
  const normalized: NormalizedWiseTransaction[] = [];

  for (const statement of statements) {
    const providerAccountId = String(statement.balance.id);
    for (const transaction of statement.transactions) {
      const currency = normalizeCurrency(
        transaction.amount?.currency ?? statement.balance.amount?.currency
      );
      const amount = transaction.amount?.value;
      const postedAt = parseWiseDate(transaction.date);
      const description = pickDescription(transaction);
      const referenceNumber = transaction.referenceNumber;

      const reasonsForThis: string[] = [];
      if (!referenceNumber) reasonsForThis.push("missing_reference");
      if (!currency) reasonsForThis.push(`unsupported_currency:${transaction.amount?.currency ?? "none"}`);
      if (!Number.isFinite(amount)) reasonsForThis.push("unparseable_amount");
      if (postedAt === null) reasonsForThis.push("unparseable_date");

      if (reasonsForThis.length > 0) {
        skippedCount += 1;
        for (const reason of reasonsForThis) {
          skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
        }
        continue;
      }

      if (
        !referenceNumber ||
        !currency ||
        !Number.isFinite(amount) ||
        postedAt === null ||
        amount === undefined
      ) {
        continue;
      }

      const merchant = pickMerchant(transaction);
      const txType = classifyTransactionType(transaction, amount);

      normalized.push({
        providerAccountId,
        providerTransactionId: referenceNumber,
        postedAt,
        amount,
        currency,
        baseCurrencyAmount: toBaseCurrencyAmount(amount, currency, fxSnapshot),
        description,
        merchant,
        categoryId: undefined,
        tinkCategoryCode: undefined,
        type: txType,
        isRecurring: false,
        isExcludedFromReports: false,
        status: "booked",
        dedupeHash: createWiseDedupeHash(provider, {
          providerAccountId,
          postedAt,
          amount,
          currency,
          description,
          merchant
        })
      });
    }
  }

  return { transactions: normalized, skippedCount, skipReasons };
}

function composeAccountName(entry: WiseBalanceWithProfile, currency: SupportedCurrency) {
  const profileName = composeProfileName(entry.profile);
  const label = entry.balance.name?.trim();
  if (label && label.length > 0) {
    return `Wise ${currency} . ${label}`;
  }
  return profileName ? `Wise ${currency} . ${profileName}` : `Wise ${currency}`;
}

function composeHolderName(profile: WiseProfile) {
  const composed = composeProfileName(profile);
  return composed && composed.length > 0 ? composed : undefined;
}

function composeProfileName(profile: WiseProfile) {
  if (profile.fullName?.trim()) return profile.fullName.trim();
  const details = profile.details;
  if (!details) return undefined;
  if (profile.type === "BUSINESS") {
    return details.businessName?.trim() ?? details.name?.trim();
  }
  const parts = [details.firstName, details.lastName].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );
  if (parts.length > 0) return parts.join(" ");
  return details.name?.trim();
}

function pickDescription(transaction: WiseStatementTransaction) {
  const detailDescription = transaction.details?.description?.trim();
  if (detailDescription && detailDescription.length > 0) return detailDescription;
  const reference = transaction.details?.paymentReference?.trim();
  if (reference && reference.length > 0) return reference;
  if (transaction.details?.type) return `Wise ${transaction.details.type.toLowerCase()}`;
  return "Wise transaction";
}

function pickMerchant(transaction: WiseStatementTransaction) {
  const sender = transaction.details?.senderName?.trim();
  if (sender && sender.length > 0) return sender;
  const recipient = transaction.details?.recipientName?.trim();
  if (recipient && recipient.length > 0) return recipient;
  return undefined;
}

function classifyTransactionType(
  transaction: WiseStatementTransaction,
  amount: number
): NormalizedWiseTransaction["type"] {
  const detailType = transaction.details?.type?.toUpperCase() ?? "";
  if (detailType.includes("FEE")) return "fee";
  if (detailType.includes("CONVERSION") || detailType.includes("TRANSFER")) return "transfer";
  if (detailType.includes("REFUND")) return "refund";
  return amount < 0 ? "expense" : "income";
}

function parseWiseDate(value: string | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeCurrency(value: string | undefined): SupportedCurrency | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  if (upper === "HUF" || upper === "EUR" || upper === "USD" || upper === "GBP") {
    return upper;
  }
  return null;
}

function createWiseDedupeHash(
  provider: string,
  input: {
    providerAccountId: string;
    postedAt: number;
    amount: number;
    currency: SupportedCurrency;
    description: string;
    merchant?: string;
  }
) {
  const day = new Date(input.postedAt).toISOString().slice(0, 10);
  return [
    provider,
    input.providerAccountId,
    day,
    input.amount.toFixed(2),
    input.currency,
    normalizeText(input.description),
    normalizeText(input.merchant ?? "")
  ].join("|");
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const wiseNormalizeInternals = {
  classifyTransactionType,
  composeAccountName,
  composeHolderName,
  createWiseDedupeHash,
  normalizeCurrency,
  parseWiseDate,
  pickDescription,
  pickMerchant
};
