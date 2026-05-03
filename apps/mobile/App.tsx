import React, { useState } from "react";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import * as SecureStore from "expo-secure-store";
import { Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PaperProvider } from "react-native-paper";

import { Shell } from "./src/components/Shell";
import { FinanceProvider } from "./src/state/FinanceContext";
import { financeTheme } from "./src/theme/theme";

export type AppTab = "onboarding" | "dashboard" | "transactions" | "debts";

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const enableAuthProviders = process.env.EXPO_PUBLIC_ENABLE_AUTH_PROVIDERS === "true";
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

const tokenCache = {
  async getToken(key: string) {
    if (Platform.OS === "web") {
      return window.localStorage.getItem(key);
    }

    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    if (Platform.OS === "web") {
      window.localStorage.setItem(key, value);
      return;
    }

    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Token persistence is best-effort on unsupported platforms.
    }
  }
};

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = {
    error: null
  };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.errorScreen}>
          <Text style={styles.errorTitle}>The app hit a startup error.</Text>
          <Text style={styles.errorMessage}>{this.state.error.message}</Text>
        </View>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>("dashboard");
  const shouldUseAuthProviders =
    enableAuthProviders && Boolean(clerkPublishableKey) && Boolean(convex);

  const appShell = (
    <SafeAreaProvider>
      <PaperProvider theme={financeTheme}>
        <FinanceProvider persistWithConvex={shouldUseAuthProviders}>
          <Shell activeTab={activeTab} onTabChange={setActiveTab} />
        </FinanceProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );

  if (!shouldUseAuthProviders || !clerkPublishableKey || !convex) {
    return <AppErrorBoundary>{appShell}</AppErrorBoundary>;
  }

  return (
    <AppErrorBoundary>
      <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          {appShell}
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  errorScreen: {
    alignItems: "center",
    backgroundColor: "#F5F7F9",
    flex: 1,
    justifyContent: "center",
    padding: 24
  },
  errorTitle: {
    color: "#17202A",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center"
  },
  errorMessage: {
    color: "#53616F",
    fontSize: 14,
    textAlign: "center"
  }
});
