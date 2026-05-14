export const API_SERVICE_NAME = "standalone-finance-api";

export type HealthResponse = {
  service: typeof API_SERVICE_NAME;
  status: "ok";
};

export type CountryCode = "HU" | "FR";

export type CurrencyCode = "HUF" | "EUR" | "USD" | "GBP";

export type AccountSource = "local_bank" | "manual";

export type AccountType =
  | "checking"
  | "savings"
  | "credit"
  | "loan"
  | "mortgage"
  | "cash";

export type TransactionType =
  | "expense"
  | "income"
  | "transfer"
  | "loan_payment"
  | "mortgage_payment"
  | "fee"
  | "refund";

export type BankDirectoryEntry = {
  id: string;
  name: string;
  country: CountryCode;
  supportedCurrencies: CurrencyCode[];
  connectionMethods: Array<"manual" | "csv" | "provider">;
  providerKey?: string;
};

export type UserProfile = {
  clerkUserId: string;
  country: CountryCode;
  locale: string;
  baseCurrency: CurrencyCode;
};

export const initialBanks: BankDirectoryEntry[] = [
  {
    id: "otp-hu",
    name: "OTP Bank",
    country: "HU",
    supportedCurrencies: ["HUF", "EUR", "USD"],
    connectionMethods: ["manual", "csv"]
  },
  {
    id: "credit-agricole-fr",
    name: "Credit Agricole",
    country: "FR",
    supportedCurrencies: ["EUR"],
    connectionMethods: ["manual", "csv"]
  }
];
