Below is a strong `DESIGNER.md` you can paste into your Expo project root.

````md
# DESIGNER.md

# FlexFinance Design System

## 1. Design Direction

FlexFinance uses a warm, calm, professional finance-oriented Material Design 3 visual language.

The brand palette is based on:

- Warm terracotta primary colors
- Soft beige / warm neutral surfaces
- Muted secondary tones
- Calm golden tertiary accents
- Clear error / danger colors

The app must feel:

- trustworthy
- calm
- readable
- financial
- professional
- friendly but not playful

---

## 2. Theme Foundation

The app uses:

- Expo React Native
- React Native Paper
- Material Design 3
- Light theme
- Dark theme

All UI colors must come from the active Paper theme.

Do not hardcode colors directly inside screens or components.

---

## 3. Light Theme

```ts
const lightColors = {
  primary: 'rgb(155, 68, 39)',
  onPrimary: 'rgb(255, 255, 255)',
  primaryContainer: 'rgb(255, 219, 208)',
  onPrimaryContainer: 'rgb(58, 11, 0)',

  secondary: 'rgb(119, 87, 77)',
  onSecondary: 'rgb(255, 255, 255)',
  secondaryContainer: 'rgb(255, 219, 208)',
  onSecondaryContainer: 'rgb(44, 22, 14)',

  tertiary: 'rgb(107, 94, 47)',
  onTertiary: 'rgb(255, 255, 255)',
  tertiaryContainer: 'rgb(244, 226, 167)',
  onTertiaryContainer: 'rgb(34, 27, 0)',

  error: 'rgb(186, 26, 26)',
  onError: 'rgb(255, 255, 255)',
  errorContainer: 'rgb(255, 218, 214)',
  onErrorContainer: 'rgb(65, 0, 2)',

  background: 'rgb(255, 251, 255)',
  onBackground: 'rgb(32, 26, 24)',
  surface: 'rgb(255, 251, 255)',
  onSurface: 'rgb(32, 26, 24)',

  surfaceVariant: 'rgb(245, 222, 215)',
  onSurfaceVariant: 'rgb(83, 67, 63)',

  outline: 'rgb(133, 115, 110)',
  outlineVariant: 'rgb(216, 194, 188)',
};
````

---

## 4. Dark Theme

```ts
const darkColors = {
  primary: 'rgb(255, 181, 158)',
  onPrimary: 'rgb(93, 24, 0)',
  primaryContainer: 'rgb(124, 45, 18)',
  onPrimaryContainer: 'rgb(255, 219, 208)',

  secondary: 'rgb(231, 189, 177)',
  onSecondary: 'rgb(68, 42, 34)',
  secondaryContainer: 'rgb(93, 64, 55)',
  onSecondaryContainer: 'rgb(255, 219, 208)',

  tertiary: 'rgb(215, 198, 141)',
  onTertiary: 'rgb(58, 48, 5)',
  tertiaryContainer: 'rgb(82, 70, 26)',
  onTertiaryContainer: 'rgb(244, 226, 167)',

  error: 'rgb(255, 180, 171)',
  onError: 'rgb(105, 0, 5)',
  errorContainer: 'rgb(147, 0, 10)',
  onErrorContainer: 'rgb(255, 180, 171)',

  background: 'rgb(32, 26, 24)',
  onBackground: 'rgb(237, 224, 220)',
  surface: 'rgb(32, 26, 24)',
  onSurface: 'rgb(237, 224, 220)',

  surfaceVariant: 'rgb(83, 67, 63)',
  onSurfaceVariant: 'rgb(216, 194, 188)',

  outline: 'rgb(160, 141, 135)',
  outlineVariant: 'rgb(83, 67, 63)',
};
```

---

## 5. Color Usage Rules

| Purpose                               | Token                |
| ------------------------------------- | -------------------- |
| Main CTA buttons                      | `primary`            |
| Text on CTA buttons                   | `onPrimary`          |
| Soft primary backgrounds              | `primaryContainer`   |
| Text on primary container             | `onPrimaryContainer` |
| Secondary buttons / filters           | `secondary`          |
| Secondary chips / containers          | `secondaryContainer` |
| Premium / insight / highlight accents | `tertiary`           |
| App background                        | `background`         |
| Card background                       | `surface`            |
| Muted cards / grouped sections        | `surfaceVariant`     |
| Primary text                          | `onSurface`          |
| Secondary text                        | `onSurfaceVariant`   |
| Borders / dividers                    | `outlineVariant`     |
| Error / danger / delete               | `error`              |

---

## 6. Finance Semantic Colors

Add custom semantic finance colors on top of Paper colors.

```ts
const financeColors = {
  income: 'rgb(0, 104, 116)',
  onIncome: 'rgb(255, 255, 255)',
  incomeContainer: 'rgb(151, 240, 255)',

  expense: 'rgb(186, 26, 26)',
  onExpense: 'rgb(255, 255, 255)',
  expenseContainer: 'rgb(255, 218, 214)',

  warning: 'rgb(156, 79, 0)',
};
```

Recommended dark version:

```ts
const financeColorsDark = {
  income: 'rgb(79, 216, 235)',
  onIncome: 'rgb(0, 54, 61)',
  incomeContainer: 'rgb(0, 79, 88)',

  expense: 'rgb(255, 180, 171)',
  onExpense: 'rgb(105, 0, 5)',
  expenseContainer: 'rgb(147, 0, 10)',

  warning: 'rgb(255, 186, 92)',
};
```

---

## 7. Finance Color Rules

| Use case                  | Color              |
| ------------------------- | ------------------ |
| Income amount             | `income`           |
| Expense amount            | `expense`          |
| Positive account movement | `income`           |
| Negative account movement | `expense`          |
| Budget warning            | `warning`          |
| Overdue payment           | `error`            |
| Delete transaction        | `error`            |
| Savings goal progress     | `tertiary`         |
| Neutral transaction       | `onSurfaceVariant` |

Never use `primary` for income or expense.
Primary is for brand and navigation actions.

---

## 8. Typography

Use React Native Paper typography.

Recommended usage:

| UI element              | Typography                    |
| ----------------------- | ----------------------------- |
| Screen title            | `headlineMedium`              |
| Dashboard total balance | `headlineLarge`               |
| Card title              | `titleMedium`                 |
| Transaction title       | `bodyLarge`                   |
| Transaction metadata    | `bodySmall`                   |
| Money amount            | `titleMedium` or `titleLarge` |
| Helper text             | `bodySmall`                   |
| Button text             | Paper default                 |

Money values should be visually strong, but not oversized everywhere.

---

## 9. Spacing

Use fixed spacing tokens.

```ts
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};
```

Rules:

| Use case                   | Spacing      |
| -------------------------- | ------------ |
| Screen padding             | `md`         |
| Card padding               | `md`         |
| Gap between cards          | `sm` or `md` |
| Section spacing            | `lg`         |
| Dashboard vertical spacing | `lg`         |
| Form field gap             | `md`         |

Avoid random values like `13`, `17`, `21`.

---

## 10. Border Radius

```ts
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};
```

Recommended usage:

| Component    | Radius |
| ------------ | ------ |
| Small chip   | `pill` |
| Button       | `md`   |
| Card         | `lg`   |
| Bottom sheet | `xl`   |
| Modal        | `xl`   |

---

## 11. Components

### Cards

Cards are used for:

* account balances
* transaction rows
* budget summaries
* financial insights
* recurring payments
* loan summaries

Use:

```ts
backgroundColor: theme.colors.surface
borderRadius: radius.lg
padding: spacing.md
```

### Buttons

Primary action:

```tsx
<Button mode="contained">
  Add Transaction
</Button>
```

Secondary action:

```tsx
<Button mode="outlined">
  View Details
</Button>
```

Text action:

```tsx
<Button mode="text">
  Cancel
</Button>
```

Danger action:

```tsx
<Button textColor={theme.colors.error}>
  Delete
</Button>
```

---

## 12. Transaction UI Rules

Income:

```txt
+ 1,200.00 EUR
```

Expense:

```txt
- 45.90 EUR
```

Rules:

* Always show currency.
* Always use locale-aware formatting.
* Do not manually concatenate currency symbols.
* Use color only as secondary meaning.
* Keep plus/minus signs visible.

---

## 13. Multi-Currency Rules

The app may contain:

* HUF
* EUR
* USD
* GBP
* other currencies

Every account must have a currency.

Every transaction must have:

```ts
amount
currency
accountId
type
categoryId
date
```

When displaying a total across currencies, show the base currency clearly.

Example:

```txt
Total net worth
€12,450.00
Converted from HUF, GBP and USD
```

---

## 14. Dark Mode Rules

Dark mode is not a simple inverted theme.

Rules:

* Use `background` for screens.
* Use `surface` for cards.
* Use `surfaceVariant` for grouped areas.
* Use `onSurface` for primary text.
* Use `onSurfaceVariant` for secondary text.
* Avoid pure white text outside theme tokens.
* Avoid hardcoded black backgrounds.

---

## 15. Accessibility

Minimum requirements:

* Touch target: at least `44x44`
* Important financial states must use text and color
* Do not rely only on red/green
* Keep sufficient contrast in both light and dark mode
* Use clear labels for icons
* Use readable font sizes for money values

Good:

```txt
Expense · -€45.90
```

Bad:

```txt
Only red text with no label
```

---

## 16. Icons

Icons should be:

* minimal
* rounded
* consistent
* theme-aware
* no embedded text
* no overly detailed illustrations

Recommended sizes:

```ts
small: 20
default: 24
large: 32
dashboard: 40
```

---

## 17. Screen Patterns

### Dashboard

Should include:

* total balance
* income summary
* expense summary
* recent transactions
* budget warning if needed
* quick action button

### Accounts

Should include:

* account name
* bank/provider
* currency
* current balance
* last sync date
* account type

### Transactions

Should include:

* merchant/title
* category
* account
* date
* amount
* currency
* transaction type

### Budgets

Should include:

* category
* used amount
* limit
* progress
* warning state

---

## 18. Do / Don’t

### Do

* Use theme tokens.
* Use semantic finance colors.
* Use locale-safe money formatting.
* Test every screen in light and dark mode.
* Keep layouts calm and spacious.
* Make financial states obvious.

### Don’t

* Hardcode colors in components.
* Use primary color for income.
* Use error color for normal expenses unless needed.
* Hide currency.
* Use tiny text for money.
* Use random spacing values.
* Depend only on color for meaning.

---

## 19. Recommended File Structure

```txt
src/
  theme/
    index.ts
    paperTheme.ts
    colors.ts
    semanticColors.ts
    spacing.ts
    radius.ts
    typography.ts
  components/
    ui/
    finance/
  screens/
    dashboard/
    accounts/
    transactions/
    budgets/
```

---

## 20. Design Principle

Every financial screen should answer three questions quickly:

1. What is the current state?
2. Is it good, bad, or neutral?
3. What can the user do next?

````

I would also add this command:

```bash
mkdir -p src/theme
touch DESIGNER.md
````

Then paste the content into `DESIGNER.md`.
