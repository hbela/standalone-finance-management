import type { Doc, Id, TableNames } from "../../../../convex/_generated/dataModel";
import {
  accountToRow,
  categoryToRow,
  expenseProfileToRow,
  importBatchToRow,
  incomeStreamToRow,
  liabilityToRow,
  recurringSubscriptionToRow,
  transactionToRow,
  userToRow,
} from "./mappers";

const id = <T extends TableNames>(value: string): Id<T> => value as Id<T>;

describe("mappers", () => {
  describe("userToRow", () => {
    it("preserves all fields and uses _id as id", () => {
      const doc: Doc<"users"> = {
        _id: id<"users">("user-1"),
        _creationTime: 1,
        clerkUserId: "clerk-1",
        country: "HU",
        locale: "hu-HU",
        baseCurrency: "EUR",
        createdAt: 100,
        updatedAt: 200,
      };

      expect(userToRow(doc)).toEqual({
        id: "user-1",
        clerkUserId: "clerk-1",
        country: "HU",
        locale: "hu-HU",
        baseCurrency: "EUR",
        createdAt: 100,
        updatedAt: 200,
      });
    });
  });

  describe("accountToRow", () => {
    it("converts undefined optional fields to null for SQLite", () => {
      const doc: Doc<"accounts"> = {
        _id: id<"accounts">("acc-1"),
        _creationTime: 1,
        userId: id<"users">("user-1"),
        source: "local_bank",
        name: "Checking",
        currency: "EUR",
        type: "checking",
        currentBalance: 1234.56,
        createdAt: 100,
        updatedAt: 200,
      };

      const row = accountToRow(doc);

      expect(row.id).toBe("acc-1");
      expect(row.bankId).toBeNull();
      expect(row.bankKey).toBeNull();
      expect(row.providerAccountId).toBeNull();
      expect(row.credentialsId).toBeNull();
      expect(row.availableBalance).toBeNull();
      expect(row.institutionName).toBeNull();
      expect(row.holderName).toBeNull();
      expect(row.iban).toBeNull();
      expect(row.bban).toBeNull();
      expect(row.lastSyncedAt).toBeNull();
      expect(row.archivedAt).toBeNull();
      expect(row.currentBalance).toBe(1234.56);
    });

    it("preserves provided optional fields", () => {
      const doc: Doc<"accounts"> = {
        _id: id<"accounts">("acc-2"),
        _creationTime: 1,
        userId: id<"users">("user-1"),
        source: "wise",
        bankKey: "wise-eur",
        providerAccountId: "wise-acc-1",
        credentialsId: "cred-1",
        name: "Wise EUR",
        currency: "EUR",
        type: "wise_balance",
        currentBalance: 500,
        availableBalance: 480,
        institutionName: "Wise",
        holderName: "Belá",
        iban: "BE68539007547034",
        bban: "539007547034",
        lastSyncedAt: 999,
        createdAt: 100,
        updatedAt: 200,
      };

      const row = accountToRow(doc);
      expect(row.availableBalance).toBe(480);
      expect(row.iban).toBe("BE68539007547034");
      expect(row.lastSyncedAt).toBe(999);
    });
  });

  describe("transactionToRow", () => {
    it("preserves boolean flags exactly (no truthy coercion)", () => {
      const doc: Doc<"transactions"> = {
        _id: id<"transactions">("tx-1"),
        _creationTime: 1,
        userId: id<"users">("user-1"),
        accountId: id<"accounts">("acc-1"),
        source: "local_bank",
        postedAt: 1700000000000,
        amount: -42.5,
        currency: "EUR",
        description: "SPAR",
        merchant: "SPAR",
        categoryId: "Food",
        type: "expense",
        isRecurring: false,
        isExcludedFromReports: false,
        dedupeHash: "hash-1",
        createdAt: 100,
        updatedAt: 200,
      };

      const row = transactionToRow(doc);
      expect(row.isRecurring).toBe(false);
      expect(row.isExcludedFromReports).toBe(false);
      expect(row.amount).toBe(-42.5);
      expect(row.dedupeHash).toBe("hash-1");
    });

    it("preserves status, notes, and recurring linkage when present", () => {
      const doc: Doc<"transactions"> = {
        _id: id<"transactions">("tx-2"),
        _creationTime: 1,
        userId: id<"users">("user-1"),
        accountId: id<"accounts">("acc-1"),
        source: "local_bank",
        postedAt: 1700000000000,
        amount: -10,
        currency: "EUR",
        baseCurrencyAmount: -10,
        description: "Netflix",
        merchant: "Netflix",
        categoryId: "Subscriptions",
        tinkCategoryCode: "expenses:subscriptions",
        type: "expense",
        isRecurring: true,
        recurringGroupId: id<"recurringSubscriptions">("rec-1"),
        isExcludedFromReports: false,
        transferMatchId: undefined,
        dedupeHash: "hash-2",
        status: "booked",
        notes: "annual sub",
        createdAt: 100,
        updatedAt: 200,
      };

      const row = transactionToRow(doc);
      expect(row.isRecurring).toBe(true);
      expect(row.recurringGroupId).toBe("rec-1");
      expect(row.tinkCategoryCode).toBe("expenses:subscriptions");
      expect(row.status).toBe("booked");
      expect(row.notes).toBe("annual sub");
      expect(row.transferMatchId).toBeNull();
    });
  });

  describe("categoryToRow", () => {
    it("nulls out optional tinkCategoryCode when missing", () => {
      const doc: Doc<"categories"> = {
        _id: id<"categories">("cat-1"),
        _creationTime: 1,
        userId: id<"users">("user-1"),
        name: "Food",
        createdAt: 100,
        updatedAt: 200,
      };

      const row = categoryToRow(doc);
      expect(row.tinkCategoryCode).toBeNull();
    });
  });

  describe("liabilityToRow", () => {
    it("preserves all required fields", () => {
      const doc: Doc<"liabilities"> = {
        _id: id<"liabilities">("liab-1"),
        _creationTime: 1,
        userId: id<"users">("user-1"),
        name: "Mortgage",
        institution: "OTP",
        type: "mortgage",
        currency: "HUF",
        originalPrincipal: 30000000,
        outstandingBalance: 20000000,
        interestRate: 4.5,
        paymentAmount: 100000,
        paymentFrequency: "monthly",
        nextDueDate: "2026-06-01",
        rateType: "fixed",
        createdAt: 100,
        updatedAt: 200,
      };

      const row = liabilityToRow(doc);
      expect(row).toMatchObject({
        id: "liab-1",
        name: "Mortgage",
        institution: "OTP",
        type: "mortgage",
        currency: "HUF",
        outstandingBalance: 20000000,
        nextDueDate: "2026-06-01",
        linkedAccountId: null,
      });
    });
  });

  describe("importBatchToRow", () => {
    it("serializes columnMapping as JSON string", () => {
      const doc: Doc<"importBatches"> = {
        _id: id<"importBatches">("batch-1"),
        _creationTime: 1,
        userId: id<"users">("user-1"),
        accountId: id<"accounts">("acc-1"),
        source: "csv",
        status: "completed",
        sourceName: "transactions.csv",
        rowCount: 10,
        importedCount: 9,
        skippedCount: 1,
        columnMapping: { Date: "postedAt", Amount: "amount" },
        dateFormat: "auto",
        createdAt: 100,
        updatedAt: 200,
      };

      const row = importBatchToRow(doc);
      expect(typeof row.columnMapping).toBe("string");
      expect(JSON.parse(row.columnMapping)).toEqual({ Date: "postedAt", Amount: "amount" });
    });

    it("falls back to {} when columnMapping is undefined", () => {
      const doc = {
        _id: id<"importBatches">("batch-2"),
        _creationTime: 1,
        userId: id<"users">("user-1"),
        accountId: id<"accounts">("acc-1"),
        source: "csv",
        status: "reverted",
        rowCount: 0,
        importedCount: 0,
        skippedCount: 0,
        columnMapping: undefined as unknown as Record<string, string>,
        dateFormat: "auto",
        createdAt: 100,
        updatedAt: 200,
      } as Doc<"importBatches">;

      const row = importBatchToRow(doc);
      expect(JSON.parse(row.columnMapping)).toEqual({});
    });
  });

  describe("recurringSubscriptionToRow", () => {
    it("preserves frequency, confidence, and timing", () => {
      const doc: Doc<"recurringSubscriptions"> = {
        _id: id<"recurringSubscriptions">("rec-1"),
        _creationTime: 1,
        userId: id<"users">("user-1"),
        accountId: id<"accounts">("acc-1"),
        groupKey: "netflix-eur-monthly",
        merchant: "Netflix",
        category: "Subscriptions",
        type: "expense",
        currency: "EUR",
        averageAmount: -12.99,
        monthlyAmount: -12.99,
        frequency: "monthly",
        confidence: "high",
        transactionCount: 6,
        firstSeenAt: 1690000000000,
        lastSeenAt: 1700000000000,
        nextExpectedAt: 1702592000000,
        createdAt: 100,
        updatedAt: 200,
      };

      const row = recurringSubscriptionToRow(doc);
      expect(row.frequency).toBe("monthly");
      expect(row.confidence).toBe("high");
      expect(row.nextExpectedAt).toBe(1702592000000);
      expect(row.averageAmount).toBeCloseTo(-12.99);
    });
  });

  describe("incomeStreamToRow", () => {
    it("maps a salary stream", () => {
      const doc: Doc<"incomeStreams"> = {
        _id: id<"incomeStreams">("inc-1"),
        _creationTime: 1,
        userId: id<"users">("user-1"),
        accountId: id<"accounts">("acc-1"),
        groupKey: "acme-eur-monthly",
        employerName: "ACME",
        currency: "EUR",
        averageAmount: 3000,
        monthlyAverage: 3000,
        frequency: "monthly",
        confidence: "high",
        transactionCount: 6,
        firstSeenAt: 1690000000000,
        lastSeenAt: 1700000000000,
        createdAt: 100,
        updatedAt: 200,
      };

      const row = incomeStreamToRow(doc);
      expect(row.employerName).toBe("ACME");
      expect(row.monthlyAverage).toBe(3000);
      expect(row.nextExpectedAt).toBeNull();
    });
  });

  describe("expenseProfileToRow", () => {
    it("maps a category-rolled-up profile", () => {
      const doc: Doc<"expenseProfiles"> = {
        _id: id<"expenseProfiles">("exp-1"),
        _creationTime: 1,
        userId: id<"users">("user-1"),
        groupKey: "food-eur",
        category: "Food",
        currency: "EUR",
        monthlyAverage: -350,
        totalAmount: -2100,
        monthsObserved: 6,
        transactionCount: 92,
        firstSeenAt: 1690000000000,
        lastSeenAt: 1700000000000,
        confidence: "high",
        createdAt: 100,
        updatedAt: 200,
      };

      const row = expenseProfileToRow(doc);
      expect(row.category).toBe("Food");
      expect(row.monthlyAverage).toBe(-350);
      expect(row.monthsObserved).toBe(6);
    });
  });
});
