import type { TinkAccount, TinkTransaction } from "./tinkMobileClient";

export const NOW = Date.parse("2026-05-14T12:00:00.000Z");

export const tinkAccountsFixture: TinkAccount[] = [
  {
    id: "gb-main/account:1",
    name: " Everyday GBP ",
    type: "CHECKING",
    currencyCode: "gbp",
    financialInstitutionName: "Demo Bank UK",
    holderName: "Ada Lovelace",
    identifiers: {
      iban: { iban: "GB29NWBK60161331926819" },
      bban: { bban: "60161331926819" },
    },
    credentials: { id: "cred-1" },
    balances: {
      booked: { amount: { value: { unscaledValue: "123456", scale: "2" }, currencyCode: "GBP" } },
      available: { value: "1200.25", currencyCode: "GBP" },
    },
  },
  {
    id: "eur-savings",
    type: "SAVINGS_ACCOUNT",
    financialInstitutionName: "Euro Credit Union",
    holders: [{ name: "  Grace Hopper " }],
    identifiers: [
      { scheme: "IBAN", value: "DE89370400440532013000" },
      { type: "BBAN", bban: { bban: "370400440532013000" } },
    ],
    balance: { amount: { value: 2500, currencyCode: "EUR" } },
  },
  {
    id: "sek-unsupported",
    name: "SEK account",
    currencyCode: "SEK",
    balance: { value: 100, currencyCode: "SEK" },
  },
  {
    id: "",
    name: "Missing id",
    currencyCode: "EUR",
  },
];

export const accountIdByProviderId = new Map([
  ["gb-main/account:1", "tink-account-gb-main-account-1"],
  ["eur-savings", "tink-account-eur-savings"],
]);

export const tinkTransactionsFixture: TinkTransaction[] = [
  {
    id: "tx-card",
    accountId: "gb-main/account:1",
    amount: { amount: { value: { unscaledValue: "-1299", scale: 2 }, currencyCode: "GBP" } },
    descriptions: { display: "Card purchase" },
    merchantInformation: { merchantName: "Corner Shop" },
    category: "expenses:food.groceries",
    dates: { booked: "2026-05-10" },
    status: "BOOKED",
  },
  {
    id: "tx-pending",
    account: { id: "eur-savings" },
    amount: "2500",
    currencyCode: "EUR",
    description: "Salary May",
    category: "income:salary",
    dates: { value: "2026-05-11T08:15:00Z" },
    status: "PENDING",
  },
  {
    id: "tx-transfer",
    accountId: "eur-savings",
    amount: -100,
    currencyCode: "EUR",
    reference: "Move to savings",
    category: "transfers",
    bookedDate: "2026-05-12",
  },
  {
    id: "tx-refund",
    accountId: "gb-main/account:1",
    amount: 4.99,
    currencyCode: "GBP",
    description: "Refund from store",
    category: "refund",
    bookedDate: "2026-05-12",
  },
  {
    id: "tx-fee",
    accountId: "gb-main/account:1",
    amount: -1.5,
    currencyCode: "GBP",
    description: "Monthly account fee",
    category: "bank fee",
    bookedDate: "2026-05-13",
  },
  { id: "", accountId: "gb-main/account:1", amount: -1, currencyCode: "GBP", bookedDate: "2026-05-13" },
  { id: "tx-missing-account", amount: -1, currencyCode: "GBP", bookedDate: "2026-05-13" },
  { id: "tx-unknown-account", accountId: "unknown", amount: -1, currencyCode: "GBP", bookedDate: "2026-05-13" },
  { id: "tx-bad-amount", accountId: "gb-main/account:1", amount: "nope", currencyCode: "GBP", bookedDate: "2026-05-13" },
  { id: "tx-bad-currency", accountId: "gb-main/account:1", amount: -1, currencyCode: "SEK", bookedDate: "2026-05-13" },
  { id: "tx-bad-date", accountId: "gb-main/account:1", amount: -1, currencyCode: "GBP", bookedDate: "not-a-date" },
];
