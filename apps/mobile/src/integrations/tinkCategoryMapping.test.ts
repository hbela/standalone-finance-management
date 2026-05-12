import { mapTinkCategoryCode } from "./tinkCategoryMapping";

// Mirror of apps/api/test/tink-category-mapping.test.mjs.
describe("mapTinkCategoryCode", () => {
  test("maps Tink food taxonomy codes to the Food app category", () => {
    for (const code of ["expenses:food.groceries", "expenses:food.restaurant", "expenses:food"]) {
      const result = mapTinkCategoryCode(code);
      expect(result.categoryId).toBe("Food");
      expect(result.tinkCategoryCode).toBe(code);
    }
  });

  test("maps utilities subcodes to Utilities", () => {
    const result = mapTinkCategoryCode("expenses:home.utilities.electricity");
    expect(result.categoryId).toBe("Utilities");
    expect(result.tinkCategoryCode).toBe("expenses:home.utilities.electricity");
  });

  test("maps mortgage to Mortgage payment", () => {
    expect(mapTinkCategoryCode("expenses:home.mortgage").categoryId).toBe("Mortgage payment");
    expect(mapTinkCategoryCode("mortgage").categoryId).toBe("Mortgage payment");
  });

  test("maps short-form sandbox codes (groceries, salary, refund, bank fee)", () => {
    expect(mapTinkCategoryCode("groceries").categoryId).toBe("Food");
    expect(mapTinkCategoryCode("salary").categoryId).toBe("Salary");
    expect(mapTinkCategoryCode("refund").categoryId).toBe("Other");
    expect(mapTinkCategoryCode("bank fee").categoryId).toBe("Fees");
  });

  test("is case-insensitive and trims whitespace", () => {
    const result = mapTinkCategoryCode("  EXPENSES:FOOD.GROCERIES  ");
    expect(result.categoryId).toBe("Food");
    expect(result.tinkCategoryCode).toBe("EXPENSES:FOOD.GROCERIES");
  });

  test("returns undefined categoryId for unknown codes but preserves the raw code", () => {
    const result = mapTinkCategoryCode("expenses:something-tink-invented-yesterday");
    expect(result.categoryId).toBeUndefined();
    expect(result.tinkCategoryCode).toBe("expenses:something-tink-invented-yesterday");
  });

  test("returns undefined for null, undefined, empty, and whitespace input", () => {
    expect(mapTinkCategoryCode(undefined)).toEqual({ categoryId: undefined, tinkCategoryCode: undefined });
    expect(mapTinkCategoryCode(null)).toEqual({ categoryId: undefined, tinkCategoryCode: undefined });
    expect(mapTinkCategoryCode("")).toEqual({ categoryId: undefined, tinkCategoryCode: undefined });
    expect(mapTinkCategoryCode("   ")).toEqual({ categoryId: undefined, tinkCategoryCode: undefined });
  });

  test("maps transfers to Internal transfer", () => {
    expect(mapTinkCategoryCode("transfers:internal").categoryId).toBe("Internal transfer");
    expect(mapTinkCategoryCode("transfer").categoryId).toBe("Internal transfer");
  });
});
