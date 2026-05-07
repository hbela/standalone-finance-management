import assert from "node:assert/strict";

import { mapTinkCategoryCode } from "../dist/tinkCategoryMapping.js";

const scenarios = [];

function scenario(name, run) {
  scenarios.push({ name, run });
}

scenario("maps Tink food taxonomy codes to the Food app category", () => {
  for (const code of ["expenses:food.groceries", "expenses:food.restaurant", "expenses:food"]) {
    const result = mapTinkCategoryCode(code);
    assert.equal(result.categoryId, "Food", `${code} should map to Food`);
    assert.equal(result.tinkCategoryCode, code);
  }
});

scenario("maps utilities subcodes to Utilities", () => {
  const result = mapTinkCategoryCode("expenses:home.utilities.electricity");
  assert.equal(result.categoryId, "Utilities");
  assert.equal(result.tinkCategoryCode, "expenses:home.utilities.electricity");
});

scenario("maps mortgage to Mortgage payment", () => {
  assert.equal(mapTinkCategoryCode("expenses:home.mortgage").categoryId, "Mortgage payment");
  assert.equal(mapTinkCategoryCode("mortgage").categoryId, "Mortgage payment");
});

scenario("maps short-form sandbox codes (groceries, salary, refund, bank fee)", () => {
  assert.equal(mapTinkCategoryCode("groceries").categoryId, "Food");
  assert.equal(mapTinkCategoryCode("salary").categoryId, "Salary");
  assert.equal(mapTinkCategoryCode("refund").categoryId, "Other");
  assert.equal(mapTinkCategoryCode("bank fee").categoryId, "Fees");
});

scenario("is case-insensitive and trims whitespace", () => {
  const result = mapTinkCategoryCode("  EXPENSES:FOOD.GROCERIES  ");
  assert.equal(result.categoryId, "Food");
  assert.equal(result.tinkCategoryCode, "EXPENSES:FOOD.GROCERIES");
});

scenario("returns undefined categoryId for unknown codes but preserves the raw code", () => {
  const result = mapTinkCategoryCode("expenses:something-tink-invented-yesterday");
  assert.equal(result.categoryId, undefined);
  assert.equal(result.tinkCategoryCode, "expenses:something-tink-invented-yesterday");
});

scenario("returns undefined for null, undefined, empty, and non-string input", () => {
  assert.deepStrictEqual(mapTinkCategoryCode(undefined), { categoryId: undefined, tinkCategoryCode: undefined });
  assert.deepStrictEqual(mapTinkCategoryCode(null), { categoryId: undefined, tinkCategoryCode: undefined });
  assert.deepStrictEqual(mapTinkCategoryCode(""), { categoryId: undefined, tinkCategoryCode: undefined });
  assert.deepStrictEqual(mapTinkCategoryCode("   "), { categoryId: undefined, tinkCategoryCode: undefined });
});

scenario("maps transfers to Internal transfer", () => {
  assert.equal(mapTinkCategoryCode("transfers:internal").categoryId, "Internal transfer");
  assert.equal(mapTinkCategoryCode("transfer").categoryId, "Internal transfer");
});

for (const testScenario of scenarios) {
  testScenario.run();
  console.log(`ok - ${testScenario.name}`);
}

console.log(`${scenarios.length} Tink category mapping scenarios passed`);
