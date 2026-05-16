import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

import type { FinanceColorTheme, FinanceThemeMode } from "./paperTheme";

const themePreferenceKey = "standalone-finance.theme-preferences.v1";

type ThemePreferences = {
  colorTheme: FinanceColorTheme;
  themeMode: FinanceThemeMode;
};

const colorThemes: FinanceColorTheme[] = ["brown", "blue", "pink"];
const themeModes: FinanceThemeMode[] = ["light", "dark"];

export async function loadThemePreferences(): Promise<ThemePreferences | null> {
  const raw = await readPreference(themePreferenceKey);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ThemePreferences>;
    if (!isColorTheme(parsed.colorTheme) || !isThemeMode(parsed.themeMode)) {
      await clearThemePreferences();
      return null;
    }
    return {
      colorTheme: parsed.colorTheme,
      themeMode: parsed.themeMode
    };
  } catch {
    await clearThemePreferences();
    return null;
  }
}

export async function saveThemePreferences(preferences: ThemePreferences): Promise<void> {
  await writePreference(themePreferenceKey, JSON.stringify(preferences));
}

export async function clearThemePreferences(): Promise<void> {
  await removePreference(themePreferenceKey);
}

function isColorTheme(value: unknown): value is FinanceColorTheme {
  return typeof value === "string" && colorThemes.includes(value as FinanceColorTheme);
}

function isThemeMode(value: unknown): value is FinanceThemeMode {
  return typeof value === "string" && themeModes.includes(value as FinanceThemeMode);
}

async function readPreference(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function writePreference(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(key, value);
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function removePreference(key: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(key);
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
