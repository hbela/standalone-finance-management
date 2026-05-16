import React from "react";
import { StyleSheet, View } from "react-native";
import { BottomNavigation, IconButton, Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

import type { AppColorTheme, AppTab, AppThemeMode, BankConnectionReturn } from "../../App";
import { DashboardScreen } from "../screens/DashboardScreen";
import { DebtsScreen } from "../screens/DebtsScreen";
import { OnboardingScreen } from "../screens/OnboardingScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { TransactionsScreen } from "../screens/TransactionsScreen";
import { useFinanceTheme } from "../theme";

type ShellProps = {
  activeTab: AppTab;
  bankConnectionReturn?: BankConnectionReturn | null;
  colorTheme: AppColorTheme;
  onBankConnectionReturnHandled?: () => void;
  onColorThemeChange: (colorTheme: AppColorTheme) => void;
  onTabChange: (tab: AppTab) => void;
  onThemeModeChange: () => void;
  themeMode: AppThemeMode;
};

const routes: Array<{ key: AppTab; title: string; focusedIcon: string; unfocusedIcon: string }> = [
  {
    key: "dashboard",
    title: "Dashboard",
    focusedIcon: "view-dashboard",
    unfocusedIcon: "view-dashboard-outline"
  },
  {
    key: "transactions",
    title: "Ledger",
    focusedIcon: "format-list-bulleted",
    unfocusedIcon: "format-list-text"
  },
  {
    key: "debts",
    title: "Debts",
    focusedIcon: "home-percent",
    unfocusedIcon: "home-percent-outline"
  },
  {
    key: "onboarding",
    title: "Setup",
    focusedIcon: "shield-check",
    unfocusedIcon: "shield-check-outline"
  },
  {
    key: "settings",
    title: "Settings",
    focusedIcon: "cog",
    unfocusedIcon: "cog-outline"
  }
];

export function Shell({
  activeTab,
  bankConnectionReturn,
  colorTheme,
  onBankConnectionReturnHandled,
  onColorThemeChange,
  onTabChange,
  onThemeModeChange,
  themeMode
}: ShellProps) {
  const theme = useFinanceTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const renderScene = React.useCallback(({ route }: { route: { key: AppTab } }) => {
    switch (route.key) {
      case "dashboard":
        return <DashboardScreen />;
      case "transactions":
        return <TransactionsScreen />;
      case "debts":
        return <DebtsScreen />;
      case "onboarding":
        return <OnboardingScreen />;
      case "settings":
        return (
          <SettingsScreen
            bankConnectionReturn={bankConnectionReturn}
            colorTheme={colorTheme}
            onBankConnectionReturnHandled={onBankConnectionReturnHandled}
            onColorThemeChange={onColorThemeChange}
          />
        );
      default:
        return null;
    }
  }, [bankConnectionReturn, onBankConnectionReturnHandled]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.brandIcon}>
            <IconButton
              accessibilityLabel="Finance cockpit"
              icon="chart-donut"
              iconColor={theme.colors.onPrimaryContainer}
              size={24}
              style={styles.brandIconButton}
            />
          </View>
          <View style={styles.headerText}>
            <Text numberOfLines={1} variant="headlineSmall" style={styles.title}>
              Finance cockpit
            </Text>
            <Text numberOfLines={1} variant="titleSmall" style={styles.kicker}>
              Standalone multi-currency management
            </Text>
          </View>
        </View>
        <IconButton
          accessibilityLabel={`Switch to ${themeMode === "dark" ? "light" : "dark"} mode`}
          icon={themeMode === "dark" ? "weather-sunny" : "weather-night"}
          mode="contained-tonal"
          onPress={onThemeModeChange}
          selected={themeMode === "dark"}
          size={22}
        />
      </View>
      <BottomNavigation
        navigationState={{
          index: routes.findIndex((route) => route.key === activeTab),
          routes
        }}
        onIndexChange={(index) => onTabChange(routes[index].key)}
        renderScene={renderScene}
        shifting={false}
        compact
        sceneAnimationEnabled
      />
    </SafeAreaView>
  );
}

function createStyles(theme: ReturnType<typeof useFinanceTheme>) {
  return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background
  },
  header: {
    alignItems: "center",
    backgroundColor: theme.colors.background,
    flexDirection: "row",
    gap: theme.spacing.md,
    justifyContent: "space-between",
    minHeight: 86,
    paddingBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md
  },
  brand: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: theme.spacing.md,
    minWidth: 0
  },
  brandIcon: {
    alignItems: "center",
    backgroundColor: theme.colors.primaryContainer,
    borderRadius: theme.radius.lg,
    height: 52,
    justifyContent: "center",
    width: 52
  },
  brandIconButton: {
    margin: 0
  },
  headerText: {
    flex: 1,
    minWidth: 0
  },
  kicker: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 18,
    fontWeight: "500",
    lineHeight: 24,
    marginTop: 2
  },
  title: {
    color: theme.colors.onBackground,
    fontSize: 32,
    fontWeight: "800",
    lineHeight: 38
  }
});
}
