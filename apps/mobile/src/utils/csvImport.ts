import { defaultCategoryNames } from "../data/categories";
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

export type DedupeTransaction = {
  accountId: string;
  postedAt: string;
  amount: number;
  currency: Currency;
  description: string;
  merchant?: string;
  dedupeHash: string;
};

export type CsvFieldKey = "postedAt" | "amount" | "currency" | "description" | "merchant" | "category" | "type";

export type CsvFieldMapping = Partial<Record<CsvFieldKey, string>>;

export type CsvDateFormat = "auto" | "yyyy-mm-dd" | "dd/mm/yyyy" | "mm/dd/yyyy";

export type CsvImportResult = {
  rows: ParsedCsvTransaction[];
  errors: string[];
  mapping: CsvFieldMapping;
  dateFormat: CsvDateFormat;
};

export type CsvInspection = {
  headers: string[];
  rowCount: number;
  delimiter: string;
  suggestedMapping: CsvFieldMapping;
  suggestedDateFormat: CsvDateFormat;
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

export function inspectTransactionsCsv(csvText: string): CsvInspection {
  const delimiter = detectDelimiter(csvText);
  const records = parseCsv(csvText, delimiter);
  const headers = records[0] ?? [];
  const normalizedHeaders = headers.map(normalizeHeader);
  const suggestedMapping = createSuggestedMapping(headers, normalizedHeaders);
  const dateIndex = getMappedIndex(headers, normalizedHeaders, suggestedMapping.postedAt);
  const dateSamples =
    dateIndex >= 0
      ? records.slice(1).map((record) => getOptionalCell(record, dateIndex)).filter(Boolean)
      : [];

  return {
    headers,
    rowCount: Math.max(records.length - 1, 0),
    delimiter,
    suggestedMapping,
    suggestedDateFormat: detectDateFormat(dateSamples)
  };
}

export function parseTransactionsCsv(
  csvText: string,
  account: Account,
  options?: {
    mapping?: CsvFieldMapping;
    dateFormat?: CsvDateFormat;
    categories?: string[];
  }
): CsvImportResult {
  const errors: string[] = [];
  const records = parseCsv(csvText, detectDelimiter(csvText));

  if (records.length < 2) {
    return {
      rows: [],
      errors: ["Paste a header row and at least one transaction row."],
      mapping: {},
      dateFormat: "auto"
    };
  }

  const rawHeaders = records[0];
  const headers = records[0].map(normalizeHeader);
  const inferredMapping = createSuggestedMapping(rawHeaders, headers);
  const mapping = {
    ...inferredMapping,
    ...removeEmptyMappingValues(options?.mapping ?? {})
  };
  const dateFormat = options?.dateFormat ?? detectDateFormatForMapping(records, rawHeaders, headers, mapping);
  const indexes = {
    postedAt: getMappedIndex(rawHeaders, headers, mapping.postedAt),
    amount: getMappedIndex(rawHeaders, headers, mapping.amount),
    currency: getMappedIndex(rawHeaders, headers, mapping.currency),
    description: getMappedIndex(rawHeaders, headers, mapping.description),
    merchant: getMappedIndex(rawHeaders, headers, mapping.merchant),
    category: getMappedIndex(rawHeaders, headers, mapping.category),
    type: getMappedIndex(rawHeaders, headers, mapping.type)
  };

  if (indexes.postedAt < 0 || indexes.amount < 0) {
    return {
      rows: [],
      errors: ["Map date and amount columns before importing."],
      mapping,
      dateFormat
    };
  }

  const rows = records.slice(1).reduce<ParsedCsvTransaction[]>((parsedRows, record, rowIndex) => {
    if (record.every((cell) => cell.trim().length === 0)) {
      return parsedRows;
    }

    const postedAt = normalizeDate(record[indexes.postedAt], dateFormat);
    const amount = parseAmount(record[indexes.amount]);
    const currency = normalizeCurrency(getOptionalCell(record, indexes.currency), account.currency);
    const description = getOptionalCell(record, indexes.description) || "Imported transaction";
    const merchant = getOptionalCell(record, indexes.merchant) || description;
    const category = normalizeCategory(getOptionalCell(record, indexes.category), options?.categories);
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

  return { rows, errors, mapping, dateFormat };
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

export function arePotentialDuplicateTransactions(left: DedupeTransaction, right: DedupeTransaction) {
  if (left.dedupeHash === right.dedupeHash) {
    return true;
  }

  if (left.accountId !== right.accountId || left.currency !== right.currency) {
    return false;
  }

  if (left.postedAt !== right.postedAt || toMinorUnits(left.amount) !== toMinorUnits(right.amount)) {
    return false;
  }

  const leftMerchant = left.merchant ?? left.description;
  const rightMerchant = right.merchant ?? right.description;
  const merchantScore = similarityScore(leftMerchant, rightMerchant);
  const descriptionScore = similarityScore(left.description, right.description);

  return (
    (merchantScore >= 0.86 && descriptionScore >= 0.72) ||
    (merchantScore >= 0.72 && descriptionScore >= 0.86) ||
    similarityScore(`${leftMerchant} ${left.description}`, `${rightMerchant} ${right.description}`) >= 0.88
  );
}

function toMinorUnits(amount: number) {
  return Math.round(amount * 100);
}

function similarityScore(left: string, right: string) {
  const normalizedLeft = normalizeForSimilarity(left);
  const normalizedRight = normalizeForSimilarity(right);

  if (normalizedLeft.length === 0 || normalizedRight.length === 0) {
    return normalizedLeft === normalizedRight ? 1 : 0;
  }

  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return Math.min(normalizedLeft.length, normalizedRight.length) / Math.max(normalizedLeft.length, normalizedRight.length);
  }

  return 1 - levenshteinDistance(normalizedLeft, normalizedRight) / Math.max(normalizedLeft.length, normalizedRight.length);
}

function normalizeForSimilarity(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(card|payment|purchase|pos|transaction|transfer|online|bank)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex + 1;

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const insertion = previous[rightIndex + 1] + 1;
      const deletion = previous[rightIndex] + 1;
      const substitution = diagonal + (left[leftIndex] === right[rightIndex] ? 0 : 1);
      diagonal = previous[rightIndex + 1];
      previous[rightIndex + 1] = Math.min(insertion, deletion, substitution);
    }
  }

  return previous[right.length];
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

function createSuggestedMapping(rawHeaders: string[], normalizedHeaders: string[]): CsvFieldMapping {
  return {
    postedAt: rawHeaders[findHeaderIndex(normalizedHeaders, headerAliases.postedAt)],
    amount: rawHeaders[findHeaderIndex(normalizedHeaders, headerAliases.amount)],
    currency: rawHeaders[findHeaderIndex(normalizedHeaders, headerAliases.currency)],
    description: rawHeaders[findHeaderIndex(normalizedHeaders, headerAliases.description)],
    merchant: rawHeaders[findHeaderIndex(normalizedHeaders, headerAliases.merchant)],
    category: rawHeaders[findHeaderIndex(normalizedHeaders, headerAliases.category)],
    type: rawHeaders[findHeaderIndex(normalizedHeaders, headerAliases.type)]
  };
}

function removeEmptyMappingValues(mapping: CsvFieldMapping): CsvFieldMapping {
  return Object.fromEntries(
    Object.entries(mapping).filter(([, value]) => value && value.trim().length > 0)
  ) as CsvFieldMapping;
}

function getMappedIndex(rawHeaders: string[], normalizedHeaders: string[], mappedHeader?: string) {
  if (!mappedHeader) {
    return -1;
  }

  const normalizedMappedHeader = normalizeHeader(mappedHeader);
  return normalizedHeaders.findIndex(
    (header, index) => header === normalizedMappedHeader || rawHeaders[index] === mappedHeader
  );
}

function getOptionalCell(record: string[], index: number) {
  if (index < 0) {
    return "";
  }
  return record[index]?.trim() ?? "";
}

function normalizeDate(value: string, format: CsvDateFormat) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const slashMatch = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (slashMatch) {
    const [, first, second, year] = slashMatch;
    const firstNumber = Number(first);
    const secondNumber = Number(second);
    const isMonthFirst =
      format === "mm/dd/yyyy" || (format === "auto" && firstNumber <= 12 && secondNumber > 12);
    let day = isMonthFirst ? second : first;
    let month = isMonthFirst ? first : second;

    if (Number(month) > 12 && Number(day) <= 12) {
      day = month;
      month = isMonthFirst ? second : first;
    }

    if (Number(day) > 31 || Number(month) > 12) {
      return "";
    }

    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

function detectDateFormatForMapping(
  records: string[][],
  rawHeaders: string[],
  normalizedHeaders: string[],
  mapping: CsvFieldMapping
): CsvDateFormat {
  const dateIndex = getMappedIndex(rawHeaders, normalizedHeaders, mapping.postedAt);
  if (dateIndex < 0) {
    return "auto";
  }

  return detectDateFormat(records.slice(1).map((record) => getOptionalCell(record, dateIndex)).filter(Boolean));
}

function detectDateFormat(samples: string[]): CsvDateFormat {
  if (samples.some((sample) => /^\d{4}-\d{2}-\d{2}$/.test(sample.trim()))) {
    return "yyyy-mm-dd";
  }

  const slashSamples = samples
    .map((sample) => sample.trim().match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/))
    .filter((match): match is RegExpMatchArray => Boolean(match));

  if (slashSamples.length === 0) {
    return "auto";
  }

  if (slashSamples.some((match) => Number(match[1]) > 12)) {
    return "dd/mm/yyyy";
  }

  if (slashSamples.some((match) => Number(match[2]) > 12)) {
    return "mm/dd/yyyy";
  }

  return "dd/mm/yyyy";
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

function normalizeCategory(value: string, categories = defaultCategoryNames) {
  const exactCategory = categories.find(
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
