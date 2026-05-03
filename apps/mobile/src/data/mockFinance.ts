import type { Account, Alert, Bank, Liability, Transaction } from "./types";

export const baseCurrency = "EUR";

export const banks: Bank[] = [
  {
    id: "otp-hu",
    name: "OTP Bank",
    country: "Hungary",
    supportedCurrencies: ["HUF", "EUR"],
    connectionMethods: ["manual", "csv", "open_banking_future"],
    providerKey: "manual-hu-otp"
  },
  {
    id: "credit-agricole-fr",
    name: "Credit Agricole",
    country: "France",
    supportedCurrencies: ["EUR"],
    connectionMethods: ["manual", "csv", "open_banking_future"],
    providerKey: "manual-fr-ca"
  }
];

export const accounts: Account[] = [
  {
    id: "a1",
    source: "local_bank",
    bankId: "otp-hu",
    name: "OTP Daily Account",
    currency: "HUF",
    type: "checking",
    currentBalance: 842000,
    lastSyncedAt: "Manual import today"
  },
  {
    id: "a2",
    source: "wise",
    name: "Wise EUR balance",
    currency: "EUR",
    type: "wise_balance",
    currentBalance: 4260,
    lastSyncedAt: "Wise sync 12 min ago"
  },
  {
    id: "a3",
    source: "wise",
    name: "Wise USD balance",
    currency: "USD",
    type: "wise_balance",
    currentBalance: 2380,
    lastSyncedAt: "Wise sync 12 min ago"
  },
  {
    id: "a4",
    source: "manual",
    name: "Emergency cash",
    currency: "GBP",
    type: "cash",
    currentBalance: 320
  }
];

export const transactions: Transaction[] = [
  {
    id: "t1",
    accountId: "a2",
    source: "wise",
    postedAt: "2026-05-01",
    amount: 2100,
    currency: "EUR",
    baseCurrencyAmount: 2100,
    description: "Freelance invoice",
    merchant: "Northstar Studio",
    category: "Freelance",
    type: "income",
    isRecurring: true,
    isExcludedFromReports: false,
    dedupeHash: "a2|2026-05-01|2100.00|EUR|freelance invoice|northstar studio"
  },
  {
    id: "t2",
    accountId: "a1",
    source: "local_bank",
    postedAt: "2026-05-01",
    amount: -305000,
    currency: "HUF",
    baseCurrencyAmount: -775,
    description: "Mortgage installment",
    merchant: "OTP Jelzalog",
    category: "Mortgage payment",
    type: "mortgage_payment",
    isRecurring: true,
    isExcludedFromReports: false,
    dedupeHash: "a1|2026-05-01|-305000.00|HUF|mortgage installment|otp jelzalog"
  },
  {
    id: "t3",
    accountId: "a1",
    source: "local_bank",
    postedAt: "2026-04-30",
    amount: -23800,
    currency: "HUF",
    baseCurrencyAmount: -60,
    description: "Groceries",
    merchant: "Spar",
    category: "Food",
    type: "expense",
    isRecurring: false,
    isExcludedFromReports: false,
    dedupeHash: "a1|2026-04-30|-23800.00|HUF|groceries|spar"
  },
  {
    id: "t4",
    accountId: "a3",
    source: "wise",
    postedAt: "2026-04-29",
    amount: -450,
    currency: "USD",
    baseCurrencyAmount: -420,
    description: "Software subscriptions",
    merchant: "SaaS Bundle",
    category: "Subscriptions",
    type: "expense",
    isRecurring: true,
    isExcludedFromReports: false,
    dedupeHash: "a3|2026-04-29|-450.00|USD|software subscriptions|saas bundle"
  },
  {
    id: "t5",
    accountId: "a2",
    source: "wise",
    postedAt: "2026-04-28",
    amount: -800,
    currency: "EUR",
    baseCurrencyAmount: -800,
    description: "EUR to HUF conversion",
    merchant: "Wise",
    category: "Internal transfer",
    type: "transfer",
    isRecurring: false,
    isExcludedFromReports: true,
    dedupeHash: "a2|2026-04-28|-800.00|EUR|eur to huf conversion|wise"
  }
];

export const liabilities: Liability[] = [
  {
    id: "l1",
    name: "Budapest apartment mortgage",
    institution: "OTP Bank",
    type: "mortgage",
    currency: "HUF",
    originalPrincipal: 36000000,
    outstandingBalance: 28400000,
    interestRate: 5.8,
    paymentAmount: 305000,
    paymentFrequency: "monthly",
    nextDueDate: "2026-05-15",
    rateType: "fixed"
  },
  {
    id: "l2",
    name: "Equipment loan",
    institution: "Credit Agricole",
    type: "personal_loan",
    currency: "EUR",
    originalPrincipal: 9000,
    outstandingBalance: 4200,
    interestRate: 4.2,
    paymentAmount: 310,
    paymentFrequency: "monthly",
    nextDueDate: "2026-05-20",
    rateType: "variable"
  }
];

export const alerts: Alert[] = [
  {
    id: "al1",
    title: "Mortgage due soon",
    detail: "OTP payment is due on May 15.",
    tone: "warning"
  },
  {
    id: "al2",
    title: "Wise healthy",
    detail: "Balances and rates synced successfully.",
    tone: "info"
  }
];
