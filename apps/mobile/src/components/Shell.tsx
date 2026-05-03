import React from "react";
import { StyleSheet, View } from "react-native";
import { BottomNavigation, IconButton, Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

import type { AppTab } from "../../App";
import { DashboardScreen } from "../screens/DashboardScreen";
import { DebtsScreen } from "../screens/DebtsScreen";
import { OnboardingScreen } from "../screens/OnboardingScreen";
import { TransactionsScreen } from "../screens/TransactionsScreen";

type ShellProps = {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  onSignOut?: () => void;
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
  }
];

export function Shell({ activeTab, onTabChange, onSignOut }: ShellProps) {
  const renderScene = BottomNavigation.SceneMap({
    dashboard: DashboardScreen,
    transactions: TransactionsScreen,
    debts: DebtsScreen,
    onboarding: OnboardingScreen
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text variant="labelLarge" style={styles.kicker}>
            Wise Finance
          </Text>
          <Text variant="titleLarge">Multi-currency cockpit</Text>
        </View>
        {onSignOut ? (
          <IconButton
            accessibilityLabel="Sign out"
            icon="logout"
            mode="contained-tonal"
            onPress={onSignOut}
            size={20}
          />
        ) : null}
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F5F7F9"
  },
  header: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 10,
    paddingTop: 8,
    backgroundColor: "#F5F7F9",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  kicker: {
    color: "#19624A",
    marginBottom: 2
  }
});
