import React, { useCallback, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Linking, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PaperProvider } from "react-native-paper";

import { AppLockScreen } from "./src/components/AppLockScreen";
import { Shell } from "./src/components/Shell";
import {
  authenticateUser,
  probeBiometricCapability,
  type BiometricCapability,
} from "./src/auth/biometric";
import { FinanceProvider } from "./src/state/FinanceContext";
import {
  createFinanceTheme,
  type FinanceColorTheme,
  type FinanceTheme,
  type FinanceThemeMode
} from "./src/theme";
import { loadThemePreferences, saveThemePreferences } from "./src/theme/preferences";
import { handleTinkBridgeCallback } from "./src/integrations/tinkBridge";
import { useTinkTokenRefreshScheduler } from "./src/services/tokenRefreshScheduler";

export type AppTab = "onboarding" | "dashboard" | "transactions" | "debts" | "settings";
export type AppThemeMode = FinanceThemeMode;
export type AppColorTheme = FinanceColorTheme;
export type BankConnectionReturn = {
  provider: "tink";
  status: "authorized" | "failed";
  message?: string;
  source?: "api" | "bridge";
};

const queryClient = new QueryClient();
const UNLOCK_PROMPT = "Unlock Standalone Finance Management";

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode; theme: FinanceTheme },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      const styles = createAppStyles(this.props.theme);
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
  const [themeMode, setThemeMode] = useState<AppThemeMode>("light");
  const [colorTheme, setColorTheme] = useState<AppColorTheme>("brown");
  const [hasLoadedThemePreferences, setHasLoadedThemePreferences] = useState(false);
  const [bankConnectionReturn, setBankConnectionReturn] = useState<BankConnectionReturn | null>(
    null
  );
  const [capability, setCapability] = useState<BiometricCapability | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const theme = React.useMemo(() => createFinanceTheme(colorTheme, themeMode), [colorTheme, themeMode]);
  const styles = React.useMemo(() => createAppStyles(theme), [theme]);
  const toggleThemeMode = useCallback(() => {
    setThemeMode((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const preferences = await loadThemePreferences();
      if (cancelled) {
        return;
      }
      if (preferences) {
        setColorTheme(preferences.colorTheme);
        setThemeMode(preferences.themeMode);
      }
      setHasLoadedThemePreferences(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedThemePreferences) {
      return;
    }
    void saveThemePreferences({ colorTheme, themeMode });
  }, [colorTheme, hasLoadedThemePreferences, themeMode]);

  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      const next = await parseBankConnectionReturn(url);
      if (!next) return;
      setBankConnectionReturn(next);
      setActiveTab("settings");
    };

    void Linking.getInitialURL().then((url) => {
      void handleUrl(url);
    });
    const subscription = Linking.addEventListener("url", ({ url }) => {
      void handleUrl(url);
    });
    return () => subscription.remove();
  }, []);

  const tryUnlock = useCallback(async (cap: BiometricCapability) => {
    // No biometric hardware (web, simulator without keychain, or device with neither
    // biometric nor passcode set up): bypass the gate.
    if (cap.isUnsupported || !cap.isAvailable || !cap.isEnrolled) {
      setIsUnlocked(true);
      return;
    }
    setIsAuthenticating(true);
    setAuthError(null);
    const result = await authenticateUser(UNLOCK_PROMPT);
    setIsAuthenticating(false);
    if (result.status === "succeeded" || result.status === "unsupported") {
      setIsUnlocked(true);
      return;
    }
    if (result.status === "failed") {
      setAuthError(result.message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cap = await probeBiometricCapability();
      if (cancelled) return;
      setCapability(cap);
      void tryUnlock(cap);
    })();
    return () => {
      cancelled = true;
    };
  }, [tryUnlock]);

  // Wait for the capability probe before deciding how to render.
  if (!capability) {
    return (
      <AppErrorBoundary theme={theme}>
        <View style={styles.errorScreen}>
          <Text style={styles.errorTitle}>Starting Standalone Finance Management…</Text>
        </View>
      </AppErrorBoundary>
    );
  }

  if (!isUnlocked) {
    return (
      <AppErrorBoundary theme={theme}>
        <SafeAreaProvider>
          <PaperProvider theme={theme}>
            <AppLockScreen
              error={authError}
              isAuthenticating={isAuthenticating}
              onUnlock={() => void tryUnlock(capability)}
            />
          </PaperProvider>
        </SafeAreaProvider>
      </AppErrorBoundary>
    );
  }

  return (
    <AppErrorBoundary theme={theme}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <PaperProvider theme={theme}>
            <FinanceProvider>
              <UnlockedAppShell
                activeTab={activeTab}
                bankConnectionReturn={bankConnectionReturn}
                onBankConnectionReturnHandled={() => setBankConnectionReturn(null)}
                colorTheme={colorTheme}
                onColorThemeChange={setColorTheme}
                onTabChange={setActiveTab}
                onThemeModeChange={toggleThemeMode}
                themeMode={themeMode}
              />
            </FinanceProvider>
          </PaperProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

function UnlockedAppShell(props: {
  activeTab: AppTab;
  bankConnectionReturn: BankConnectionReturn | null;
  colorTheme: AppColorTheme;
  onBankConnectionReturnHandled: () => void;
  onColorThemeChange: (colorTheme: AppColorTheme) => void;
  onTabChange: (tab: AppTab) => void;
  onThemeModeChange: () => void;
  themeMode: AppThemeMode;
}) {
  // Mount the Tink access-token refresh scheduler only after biometric unlock.
  // Refreshing while the gate is up would prompt the user mid-lock with no UI.
  useTinkTokenRefreshScheduler();
  return <Shell {...props} />;
}

async function parseBankConnectionReturn(url: string | null): Promise<BankConnectionReturn | null> {
  if (!url) return null;

  try {
    const bridgeResult = await handleTinkBridgeCallback(url);
    if (bridgeResult?.status === "authorized") {
      return { provider: "tink", status: "authorized", source: "bridge" };
    }
    if (bridgeResult?.status === "failed") {
      return {
        provider: "tink",
        status: "failed",
        message: bridgeResult.message,
        source: "bridge",
      };
    }

    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/+/, "");
    const isBankConnectedReturn = parsed.hostname === "bank-connected" || path === "bank-connected";
    const provider = parsed.searchParams.get("provider");
    const status = parsed.searchParams.get("status");

    if (!isBankConnectedReturn || provider !== "tink") return null;

    if (status === "authorized") {
      return { provider, status, source: "api" };
    }
    if (status === "failed") {
      return {
        provider,
        status,
        message:
          parsed.searchParams.get("message") ??
          parsed.searchParams.get("error") ??
          "Tink authorization failed.",
        source: "api",
      };
    }
  } catch {
    return null;
  }

  return null;
}

function createAppStyles(theme: FinanceTheme) {
  return StyleSheet.create({
  errorScreen: {
    alignItems: "center",
    backgroundColor: theme.colors.background,
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  errorTitle: {
    color: theme.colors.onBackground,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  errorMessage: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 14,
    textAlign: "center",
  },
});
}
