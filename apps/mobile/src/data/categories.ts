import type { TransactionType } from "./types";

export const transactionTypeOptions: Array<{ label: string; value: TransactionType }> = [
  { label: "Expense", value: "expense" },
  { label: "Income", value: "income" },
  { label: "Transfer", value: "transfer" },
  { label: "Loan", value: "loan_payment" },
  { label: "Mortgage", value: "mortgage_payment" },
  { label: "Fee", value: "fee" },
  { label: "Refund", value: "refund" }
];

export const categoryOptions = [
  "Salary",
  "Freelance",
  "Housing",
  "Food",
  "Transport",
  "Utilities",
  "Subscriptions",
  "Healthcare",
  "Education",
  "Travel",
  "Taxes",
  "Fees",
  "Mortgage payment",
  "Loan payment",
  "Internal transfer",
  "Other"
];
