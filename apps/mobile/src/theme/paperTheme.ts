import { MD3DarkTheme, MD3LightTheme, useTheme, type MD3Theme } from "react-native-paper";

import {
  blueDarkColors,
  blueLightColors,
  brownDarkColors,
  brownLightColors,
  pinkDarkColors,
  pinkLightColors
} from "./colors";
import { radius } from "./radius";
import { financeColors, financeColorsDark, type FinanceSemanticColors } from "./semanticColors";
import { spacing } from "./spacing";

export type FinanceTheme = MD3Theme & {
  finance: FinanceSemanticColors;
  radius: typeof radius;
  spacing: typeof spacing;
};

export type FinanceColorTheme = "brown" | "blue" | "pink";
export type FinanceThemeMode = "light" | "dark";

const colorThemes = {
  brown: {
    light: brownLightColors,
    dark: brownDarkColors
  },
  blue: {
    light: blueLightColors,
    dark: blueDarkColors
  },
  pink: {
    light: pinkLightColors,
    dark: pinkDarkColors
  }
};

export function createFinanceTheme(colorTheme: FinanceColorTheme, themeMode: FinanceThemeMode): FinanceTheme {
  const baseTheme = themeMode === "dark" ? MD3DarkTheme : MD3LightTheme;

  return {
    ...baseTheme,
    dark: themeMode === "dark",
    roundness: radius.md,
    colors: {
      ...baseTheme.colors,
      ...colorThemes[colorTheme][themeMode]
    },
    finance: themeMode === "dark" ? financeColorsDark : financeColors,
    radius,
    spacing
  };
}

export const financeLightTheme: FinanceTheme = createFinanceTheme("brown", "light");
export const financeDarkTheme: FinanceTheme = createFinanceTheme("brown", "dark");
export const financeBlueLightTheme: FinanceTheme = createFinanceTheme("blue", "light");
export const financeBlueDarkTheme: FinanceTheme = createFinanceTheme("blue", "dark");
export const financePinkLightTheme: FinanceTheme = createFinanceTheme("pink", "light");
export const financePinkDarkTheme: FinanceTheme = createFinanceTheme("pink", "dark");

export function useFinanceTheme(): FinanceTheme {
  return useTheme() as FinanceTheme;
}
