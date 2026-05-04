import type { Account } from "../data/types";
import {
  arePotentialDuplicateTransactions,
  createTransactionDedupeHash,
  inspectTransactionsCsv,
  parseTransactionsCsv
} from "./csvImport";

const account: Account = {
  id: "account-checking",
  source: "manual",
  name: "Everyday",
  currency: "EUR",
  type: "checking",
  currentBalance: 0
};

describe("csv import quality", () => {
  it("inspects headers, delimiter, row count, and date format before import", () => {
    const inspection = inspectTransactionsCsv("booking_date;value;ccy;payee\n15/04/2026;-42,50;EUR;Market");

    expect(inspection).toMatchObject({
      headers: ["booking_date", "value", "ccy", "payee"],
      rowCount: 1,
      delimiter: ";",
      suggestedDateFormat: "dd/mm/yyyy",
      suggestedMapping: {
        postedAt: "booking_date",
        amount: "value",
        currency: "ccy",
        merchant: "payee"
      }
    });
  });

  it("parses mapped CSV rows into normalized transactions", () => {
    const parsed = parseTransactionsCsv(
      [
        "Date,Amount,Currency,Merchant,Details,Category",
        "04/15/2026,\"-1,234.56\",USD,\"ACME, Inc.\",Cloud hosting,Software"
      ].join("\n"),
      account,
      {
        dateFormat: "mm/dd/yyyy",
        categories: ["Software"],
        mapping: {
          postedAt: "Date",
          amount: "Amount",
          currency: "Currency",
          merchant: "Merchant",
          description: "Details",
          category: "Category"
        }
      }
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      expect.objectContaining({
        postedAt: "2026-04-15",
        amount: -1234.56,
        currency: "USD",
        merchant: "ACME, Inc.",
        description: "Cloud hosting",
        category: "Software",
        type: "expense"
      })
    ]);
    expect(parsed.rows[0].dedupeHash).toContain("account-checking|2026-04-15|-1234.56|USD");
  });

  it("reports row-level validation errors without blocking valid rows", () => {
    const parsed = parseTransactionsCsv("date,amount\nnot-a-date,20\n2026-05-01,0\n2026-05-02,35", account);

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({ postedAt: "2026-05-02", amount: 35, type: "income" });
    expect(parsed.errors).toEqual(["Row 2: invalid date.", "Row 3: invalid amount."]);
  });

  it("detects likely duplicates across exact hashes and similar statement text", () => {
    const exactHash = createTransactionDedupeHash({
      accountId: account.id,
      postedAt: "2026-05-01",
      amount: -19.99,
      currency: "EUR",
      description: "POS card payment Spotify",
      merchant: "Spotify"
    });

    expect(
      arePotentialDuplicateTransactions(
        {
          accountId: account.id,
          postedAt: "2026-05-01",
          amount: -19.99,
          currency: "EUR",
          description: "POS card payment Spotify",
          merchant: "Spotify",
          dedupeHash: exactHash
        },
        {
          accountId: account.id,
          postedAt: "2026-05-01",
          amount: -19.99,
          currency: "EUR",
          description: "Spotify",
          merchant: "Spotify",
          dedupeHash: "different-hash"
        }
      )
    ).toBe(true);
  });
});
