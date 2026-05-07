export type AppCategoryName =
  | "Salary"
  | "Freelance"
  | "Housing"
  | "Food"
  | "Transport"
  | "Utilities"
  | "Subscriptions"
  | "Healthcare"
  | "Education"
  | "Travel"
  | "Taxes"
  | "Fees"
  | "Mortgage payment"
  | "Loan payment"
  | "Internal transfer"
  | "Other";

export type TinkCategoryResolution = {
  categoryId: AppCategoryName | undefined;
  tinkCategoryCode: string | undefined;
};

const PREFIX_RULES: Array<[string, AppCategoryName]> = [
  ["expenses:food.groceries", "Food"],
  ["expenses:food.restaurant", "Food"],
  ["expenses:food.coffee", "Food"],
  ["expenses:food", "Food"],

  ["expenses:transport.public", "Transport"],
  ["expenses:transport.taxi", "Transport"],
  ["expenses:transport.fuel", "Transport"],
  ["expenses:transport.parking", "Transport"],
  ["expenses:transport", "Transport"],

  ["expenses:home.rent", "Housing"],
  ["expenses:home.mortgage", "Mortgage payment"],
  ["expenses:home.utilities.water", "Utilities"],
  ["expenses:home.utilities.electricity", "Utilities"],
  ["expenses:home.utilities.gas", "Utilities"],
  ["expenses:home.utilities.internet", "Utilities"],
  ["expenses:home.utilities", "Utilities"],
  ["expenses:home", "Housing"],

  ["expenses:entertainment.subscriptions", "Subscriptions"],
  ["expenses:entertainment", "Subscriptions"],
  ["expenses:media.subscriptions", "Subscriptions"],
  ["expenses:media", "Subscriptions"],

  ["expenses:health.pharmacy", "Healthcare"],
  ["expenses:health.dental", "Healthcare"],
  ["expenses:health", "Healthcare"],

  ["expenses:education", "Education"],

  ["expenses:travel.flights", "Travel"],
  ["expenses:travel.hotel", "Travel"],
  ["expenses:travel", "Travel"],

  ["expenses:taxes", "Taxes"],
  ["expenses:fees", "Fees"],
  ["expenses:bank-fee", "Fees"],
  ["expenses:bank.fee", "Fees"],

  ["expenses:loan-payment", "Loan payment"],
  ["expenses:loan", "Loan payment"],
  ["expenses:mortgage-payment", "Mortgage payment"],
  ["expenses:mortgage", "Mortgage payment"],

  ["transfers:internal", "Internal transfer"],
  ["transfers", "Internal transfer"],

  ["income:salary", "Salary"],
  ["income:freelance", "Freelance"],
  ["income:other", "Other"],
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
  water: "Utilities",
  electricity: "Utilities",
  gas: "Utilities",
  internet: "Utilities",
  subscriptions: "Subscriptions",
  subscription: "Subscriptions",
  entertainment: "Subscriptions",
  media: "Subscriptions",
  health: "Healthcare",
  healthcare: "Healthcare",
  pharmacy: "Healthcare",
  dental: "Healthcare",
  education: "Education",
  travel: "Travel",
  hotel: "Travel",
  flight: "Travel",
  flights: "Travel",
  taxes: "Taxes",
  tax: "Taxes",
  fee: "Fees",
  fees: "Fees",
  "bank fee": "Fees",
  "bank-fee": "Fees",
  loan: "Loan payment",
  "loan payment": "Loan payment",
  "loan-payment": "Loan payment",
  "mortgage payment": "Mortgage payment",
  "mortgage-payment": "Mortgage payment",
  transfer: "Internal transfer",
  "internal transfer": "Internal transfer",
  transfers: "Internal transfer",
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
