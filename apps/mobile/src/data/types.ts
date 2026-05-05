export type Currency = "HUF" | "EUR" | "USD" | "GBP";

export type Bank = {
  id: string;
  name: string;
  country: string;
  supportedCurrencies: Currency[];
  connectionMethods: Array<"manual" | "csv" | "open_banking_future">;
  providerKey?: string;
};

export type Account = {
  id: string;
  source: "local_bank" | "wise" | "manual";
  bankId?: string;
  providerAccountId?: string;
  name: string;
  currency: Currency;
  type: "checking" | "savings" | "credit" | "loan" | "mortgage" | "wise_balance" | "cash";
  currentBalance: number;
  lastSyncedAt?: string;
};

export type TransactionType =
  | "expense"
  | "income"
  | "transfer"
  | "loan_payment"
  | "mortgage_payment"
  | "fee"
  | "refund";

export type Category = {
  id: string;
  name: string;
  isDefault: boolean;
};

export type Transaction = {
  id: string;
  accountId: string;
  source: Account["source"];
  postedAt: string;
  amount: number;
  currency: Currency;
  baseCurrencyAmount: number;
  description: string;
  merchant: string;
  category: string;
  type: TransactionType;
  isRecurring: boolean;
  isExcludedFromReports: boolean;
  transferMatchId?: string;
  dedupeHash: string;
  notes?: string;
};

export type ImportBatch = {
  id: string;
  accountId: string;
  source: "csv";
  status: "completed" | "reverted";
  sourceName?: string;
  rowCount: number;
  importedCount: number;
  skippedCount: number;
  columnMapping: Record<string, string>;
  dateFormat: string;
  createdAt: string;
};

export type Liability = {
  id: string;
  name: string;
  institution: string;
  type: "personal_loan" | "mortgage" | "student_loan" | "car_loan" | "credit_card_debt" | "other";
  currency: Currency;
  originalPrincipal: number;
  outstandingBalance: number;
  interestRate: number;
  paymentAmount: number;
  paymentFrequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
  nextDueDate: string;
  rateType: "fixed" | "variable";
};

export type Alert = {
  id: string;
  title: string;
  detail: string;
  tone: "warning" | "info" | "error";
};
