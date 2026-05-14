import type { Alert, Bank } from "./types";

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

export const alerts: Alert[] = [
  {
    id: "al1",
    title: "Mortgage due soon",
    detail: "OTP payment is due on May 15.",
    tone: "warning"
  }
];
