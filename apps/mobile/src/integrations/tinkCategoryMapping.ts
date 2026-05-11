import type { Category } from "../data/types";

type AppCategoryName = Category["name"];

export type TinkCategoryResolution = {
  categoryId: AppCategoryName | undefined;
  tinkCategoryCode: string | undefined;
};

const PREFIX_RULES: Array<[string, AppCategoryName]> = [
  ["expenses:food", "Food"],
  ["expenses:transport", "Transport"],
  ["expenses:home.rent", "Housing"],
  ["expenses:home.mortgage", "Mortgage payment"],
  ["expenses:home.utilities", "Utilities"],
  ["expenses:home", "Housing"],
  ["expenses:entertainment", "Subscriptions"],
  ["expenses:media", "Subscriptions"],
  ["expenses:health", "Healthcare"],
  ["expenses:education", "Education"],
  ["expenses:travel", "Travel"],
  ["expenses:taxes", "Taxes"],
  ["expenses:fees", "Fees"],
  ["expenses:bank-fee", "Fees"],
  ["expenses:bank.fee", "Fees"],
  ["expenses:loan", "Loan payment"],
  ["expenses:mortgage", "Mortgage payment"],
  ["transfers", "Internal transfer"],
  ["income:salary", "Salary"],
  ["income:freelance", "Freelance"],
  ["income", "Salary"]
];

const SHORT_FORM_RULES: Record<string, AppCategoryName> = {
  groceries: "Food",
  restaurant: "Food",
  restaurants: "Food",
  food: "Food",
  coffee: "Food",
  transport: "Transport",
  taxi: "Transport",
  fuel: "Transport",
  parking: "Transport",
  rent: "Housing",
  mortgage: "Mortgage payment",
  housing: "Housing",
  utilities: "Utilities",
  subscriptions: "Subscriptions",
  subscription: "Subscriptions",
  health: "Healthcare",
  healthcare: "Healthcare",
  education: "Education",
  travel: "Travel",
  taxes: "Taxes",
  tax: "Taxes",
  fee: "Fees",
  fees: "Fees",
  "bank fee": "Fees",
  loan: "Loan payment",
  "loan payment": "Loan payment",
  transfer: "Internal transfer",
  "internal transfer": "Internal transfer",
  salary: "Salary",
  income: "Salary",
  freelance: "Freelance",
  refund: "Other",
  other: "Other"
};

export function mapTinkCategoryCode(rawCode: string | undefined | null): TinkCategoryResolution {
  if (typeof rawCode !== "string") {
    return { categoryId: undefined, tinkCategoryCode: undefined };
  }

  const trimmed = rawCode.trim();
  if (trimmed.length === 0) {
    return { categoryId: undefined, tinkCategoryCode: undefined };
  }

  const normalized = trimmed.toLowerCase();
  const shortMatch = SHORT_FORM_RULES[normalized];
  if (shortMatch) {
    return { categoryId: shortMatch, tinkCategoryCode: trimmed };
  }

  for (const [prefix, name] of PREFIX_RULES) {
    if (normalized === prefix || normalized.startsWith(`${prefix}.`) || normalized.startsWith(`${prefix}:`)) {
      return { categoryId: name, tinkCategoryCode: trimmed };
    }
  }

  return { categoryId: undefined, tinkCategoryCode: trimmed };
}
