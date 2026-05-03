import type { Currency } from "../data/types";

const localeByCurrency: Record<Currency, string> = {
  EUR: "en-IE",
  HUF: "hu-HU",
  USD: "en-US",
  GBP: "en-GB"
};

export function formatMoney(amount: number, currency: Currency): string {
  return new Intl.NumberFormat(localeByCurrency[currency], {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "HUF" ? 0 : 2
  }).format(amount);
}

export function formatSignedMoney(amount: number, currency: Currency): string {
  const formatted = formatMoney(Math.abs(amount), currency);
  return amount < 0 ? `-${formatted}` : formatted;
}
