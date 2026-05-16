export type FinanceSemanticColors = {
  income: string;
  onIncome: string;
  incomeContainer: string;
  expense: string;
  onExpense: string;
  expenseContainer: string;
  warning: string;
};

export const financeColors: FinanceSemanticColors = {
  income: "rgb(0, 104, 116)",
  onIncome: "rgb(255, 255, 255)",
  incomeContainer: "rgb(151, 240, 255)",
  expense: "rgb(186, 26, 26)",
  onExpense: "rgb(255, 255, 255)",
  expenseContainer: "rgb(255, 218, 214)",
  warning: "rgb(156, 79, 0)"
};

export const financeColorsDark: FinanceSemanticColors = {
  income: "rgb(79, 216, 235)",
  onIncome: "rgb(0, 54, 61)",
  incomeContainer: "rgb(0, 79, 88)",
  expense: "rgb(255, 180, 171)",
  onExpense: "rgb(105, 0, 5)",
  expenseContainer: "rgb(147, 0, 10)",
  warning: "rgb(255, 186, 92)"
};
