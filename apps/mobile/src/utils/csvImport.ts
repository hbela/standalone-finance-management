import { categoryOptions } from "../data/categories";
import type { Account, Currency, TransactionType } from "../data/types";
import { toBaseCurrency } from "./finance";

export type ParsedCsvTransaction = {
  postedAt: string;
  amount: number;
  currency: Currency;
  description: string;
  merchant: string;
  category: string;
  type: TransactionType;
  dedupeHash: string;
};

export type CsvImportResult = {
  rows: ParsedCsvTransaction[];
  errors: string[];
};

const currencyCodes: Currency[] = ["HUF", "EUR", "USD", "GBP"];
const transactionTypes: TransactionType[] = [
  "expense",
  "income",
  "transfer",
  "loan_payment",
  "mortgage_payment",
  "fee",
  "refund"
];

const headerAliases = {
  postedAt: ["date", "postedat", "posted_at", "bookingdate", "booking_date", "transactiondate", "transaction_date"],
  amount: ["amount", "value", "sum", "transactionamount", "transaction_amount"],
  currency: ["currency", "ccy", "currencycode", "currency_code"],
  description: ["description", "details", "memo", "narrative", "reference"],
  merchant: ["merchant", "counterparty", "payee", "partner", "name"],
  category: ["category", "categoryid", "category_id"],
  type: ["type", "transactiontype", "transaction_type"]
} as const;

export function parseTransactionsCsv(csvText: string, account: Account): CsvImportResult {
  const errors: string[] = [];
  const records = parseCsv(csvText, detectDelimiter(csvText));

  if (records.length < 2) {
    return {
      rows: [],
      errors: ["Paste a header row and at least one transaction row."]
    };
  }

  const headers = records[0].map(normalizeHeader);
  const indexes = {
    postedAt: findHeaderIndex(headers, headerAliases.postedAt),
    amount: findHeaderIndex(headers, headerAliases.amount),
    currency: findHeaderIndex(headers, headerAliases.currency),
    description: findHeaderIndex(headers, headerAliases.description),
    merchant: findHeaderIndex(headers, headerAliases.merchant),
    category: findHeaderIndex(headers, headerAliases.category),
    type: findHeaderIndex(headers, headerAliases.type)
  };

  if (indexes.postedAt < 0 || indexes.amount < 0) {
    return {
      rows: [],
      errors: ["CSV must include date and amount columns."]
    };
  }

  const rows = records.slice(1).reduce<ParsedCsvTransaction[]>((parsedRows, record, rowIndex) => {
    if (record.every((cell) => cell.trim().length === 0)) {
      return parsedRows;
    }

    const postedAt = normalizeDate(record[indexes.postedAt]);
    const amount = parseAmount(record[indexes.amount]);
    const currency = normalizeCurrency(getOptionalCell(record, indexes.currency), account.currency);
    const description = getOptionalCell(record, indexes.description) || "Imported transaction";
    const merchant = getOptionalCell(record, indexes.merchant) || description;
    const category = normalizeCategory(getOptionalCell(record, indexes.category));
    const type = normalizeType(getOptionalCell(record, indexes.type), amount, category);

    if (!postedAt) {
      errors.push(`Row ${rowIndex + 2}: invalid date.`);
      return parsedRows;
    }

    if (!Number.isFinite(amount) || amount === 0) {
      errors.push(`Row ${rowIndex + 2}: invalid amount.`);
      return parsedRows;
    }

    parsedRows.push({
      postedAt,
      amount,
      currency,
      description,
      merchant,
      category,
      type,
      dedupeHash: createTransactionDedupeHash({
        accountId: account.id,
        postedAt,
        amount,
        currency,
        description,
        merchant
      })
    });

    return parsedRows;
  }, []);

  return { rows, errors };
}

export function toImportedTransaction(row: ParsedCsvTransaction, account: Account) {
  return {
    id: `transaction-${Date.now()}-${Math.round(Math.random() * 100000)}`,
    accountId: account.id,
    source: account.source,
    postedAt: row.postedAt,
    amount: row.amount,
    currency: row.currency,
    baseCurrencyAmount: toBaseCurrency(row.amount, row.currency),
    description: row.description,
    merchant: row.merchant,
    category: row.category,
    type: row.type,
    isRecurring: false,
    isExcludedFromReports: row.type === "transfer",
    dedupeHash: row.dedupeHash,
    notes: "Imported from CSV"
  };
}

export function createTransactionDedupeHash(input: {
  accountId: string;
  postedAt: string;
  amount: number;
  currency: Currency;
  description: string;
  merchant: string;
}) {
  return [
    input.accountId,
    input.postedAt,
    input.amount.toFixed(2),
    input.currency,
    input.description.trim().toLowerCase(),
    input.merchant.trim().toLowerCase()
  ].join("|");
}

function detectDelimiter(csvText: string) {
  const firstLine = csvText.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
  const candidates = [",", ";", "\t"];

  return candidates.reduce(
    (best, candidate) => {
      const count = firstLine.split(candidate).length;
      return count > best.count ? { delimiter: candidate, count } : best;
    },
    { delimiter: ",", count: 0 }
  ).delimiter;
}

function parseCsv(csvText: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let insideQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    const nextCharacter = csvText[index + 1];

    if (character === "\"" && insideQuotes && nextCharacter === "\"") {
      cell += "\"";
      index += 1;
    } else if (character === "\"") {
      insideQuotes = !insideQuotes;
    } else if (character === delimiter && !insideQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !insideQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  row.push(cell.trim());
  rows.push(row);

  return rows.filter((candidate) => candidate.some((value) => value.length > 0));
}

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function findHeaderIndex(headers: string[], aliases: readonly string[]) {
  return headers.findIndex((header) => aliases.includes(header));
}

function getOptionalCell(record: string[], index: number) {
  if (index < 0) {
    return "";
  }
  return record[index]?.trim() ?? "";
}

function normalizeDate(value: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const slashMatch = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

function parseAmount(value: string) {
  const compact = value.replace(/\s/g, "");
  const hasComma = compact.includes(",");
  const hasDot = compact.includes(".");
  let normalized = compact;

  if (hasComma && hasDot) {
    const commaIndex = compact.lastIndexOf(",");
    const dotIndex = compact.lastIndexOf(".");
    normalized =
      commaIndex > dotIndex
        ? compact.replace(/\./g, "").replace(",", ".")
        : compact.replace(/,/g, "");
  } else if (hasComma) {
    normalized = compact.replace(/,/g, ".");
  }

  return Number(normalized);
}

function normalizeCurrency(value: string, fallback: Currency): Currency {
  const normalized = value.trim().toUpperCase();
  return currencyCodes.includes(normalized as Currency) ? (normalized as Currency) : fallback;
}

function normalizeCategory(value: string) {
  const exactCategory = categoryOptions.find(
    (category) => category.toLowerCase() === value.trim().toLowerCase()
  );
  return exactCategory ?? "Other";
}

function normalizeType(value: string, amount: number, category: string): TransactionType {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  if (transactionTypes.includes(normalized as TransactionType)) {
    return normalized as TransactionType;
  }
  if (category === "Mortgage payment") {
    return "mortgage_payment";
  }
  if (category === "Loan payment") {
    return "loan_payment";
  }
  return amount > 0 ? "income" : "expense";
}
