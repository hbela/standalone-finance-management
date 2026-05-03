import React, { useState } from "react";
import { ClerkProvider, useAuth, useSignIn, useSignUp } from "@clerk/clerk-expo";
import { ConvexProviderWithAuth, ConvexReactClient, useConvexAuth } from "convex/react";
import * as SecureStore from "expo-secure-store";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Button, Card, PaperProvider, TextInput } from "react-native-paper";

import { Shell } from "./src/components/Shell";
import { FinanceProvider } from "./src/state/FinanceContext";
import { financeTheme } from "./src/theme/theme";

export type AppTab = "onboarding" | "dashboard" | "transactions" | "debts";

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const enableAuthProviders = process.env.EXPO_PUBLIC_ENABLE_AUTH_PROVIDERS === "true";
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;
const clerkConvexJwtTemplate = "convex-wise-finance";

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

class FinanceDataErrorBoundary extends React.Component<
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
          <Text style={styles.errorTitle}>Finance data could not load.</Text>
          <Text style={styles.errorMessage}>{this.state.error.message}</Text>
        </View>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>("dashboard");
  const missingAuthProviderConfig = enableAuthProviders && (!clerkPublishableKey || !convexUrl);
  const shouldUseAuthProviders =
    enableAuthProviders && Boolean(clerkPublishableKey) && Boolean(convex);

  if (missingAuthProviderConfig) {
    const missingValues = [
      !clerkPublishableKey ? "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY" : null,
      !convexUrl ? "EXPO_PUBLIC_CONVEX_URL" : null
    ]
      .filter(Boolean)
      .join(", ");

    return (
      <AppErrorBoundary>
        <View style={styles.errorScreen}>
          <Text style={styles.errorTitle}>Auth providers are enabled but configuration is incomplete.</Text>
          <Text style={styles.errorMessage}>Missing: {missingValues}</Text>
        </View>
      </AppErrorBoundary>
    );
  }

  const localAppShell = (
    <SafeAreaProvider>
      <PaperProvider theme={financeTheme}>
        <FinanceProvider persistWithConvex={shouldUseAuthProviders}>
          <Shell activeTab={activeTab} onTabChange={setActiveTab} />
        </FinanceProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );

  if (!shouldUseAuthProviders || !clerkPublishableKey || !convex) {
    return <AppErrorBoundary>{localAppShell}</AppErrorBoundary>;
  }

  return (
    <AppErrorBoundary>
      <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
        <ConvexProviderWithAuth client={convex} useAuth={useClerkConvexAuth}>
          <PersistedAppShell activeTab={activeTab} onTabChange={setActiveTab} />
        </ConvexProviderWithAuth>
      </ClerkProvider>
    </AppErrorBoundary>
  );
}

function useClerkConvexAuth() {
  const { isLoaded, isSignedIn, getToken, orgId, orgRole } = useAuth();
  const getTokenRef = React.useRef(getToken);

  React.useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const fetchAccessToken = React.useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      try {
        return await getTokenRef.current({
          template: clerkConvexJwtTemplate,
          skipCache: forceRefreshToken
        });
      } catch {
        return null;
      }
    },
    // Clerk Expo's useAuth hook does not memoize getToken, so including it here
    // makes Convex repeatedly reset auth and flash the loading screen.
    [orgId, orgRole]
  );

  return React.useMemo(
    () => ({
      isLoading: !isLoaded,
      isAuthenticated: isSignedIn ?? false,
      fetchAccessToken
    }),
    [fetchAccessToken, isLoaded, isSignedIn]
  );
}

function PersistedAppShell({
  activeTab,
  onTabChange
}: {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { isLoaded, isSignedIn, signOut } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.errorScreen}>
        <Text style={styles.errorTitle}>Connecting to your finance workspace...</Text>
        <Text style={styles.errorMessage}>Checking Clerk and Convex authentication.</Text>
      </View>
    );
  }

  if (isLoaded && !isSignedIn) {
    return (
      <SafeAreaProvider>
        <PaperProvider theme={financeTheme}>
          <AuthScreen />
        </PaperProvider>
      </SafeAreaProvider>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.errorScreen}>
        <Text style={styles.errorTitle}>Clerk is signed in, but Convex rejected the token.</Text>
        <Text style={styles.errorMessage}>
          Confirm Clerk has a JWT template named "convex-wise-finance" with audience
          "convex-wise-finance", then restart Expo.
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <PaperProvider theme={financeTheme}>
        <FinanceDataErrorBoundary>
          <FinanceProvider persistWithConvex>
            <Shell activeTab={activeTab} onTabChange={onTabChange} onSignOut={() => void signOut()} />
          </FinanceProvider>
        </FinanceDataErrorBoundary>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>("signIn");

  return (
    <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
      <View style={styles.authScreen}>
        <Card mode="contained" style={styles.authCard}>
          <Card.Content style={styles.authContent}>
            <View>
              <Text style={styles.authKicker}>Wise Finance</Text>
              <Text style={styles.authTitle}>
                {mode === "signIn" ? "Sign in to your finance workspace" : "Create your finance workspace"}
              </Text>
              <Text style={styles.authCopy}>
                {mode === "signIn"
                  ? "Use your Clerk account to sync accounts, transactions, imports, and liabilities with Convex."
                  : "Create a Clerk account, verify your email, then start saving finance data securely."}
              </Text>
            </View>

            <View style={styles.authModeRow}>
              <Button
                compact
                mode={mode === "signIn" ? "contained" : "outlined"}
                onPress={() => setMode("signIn")}
              >
                Sign in
              </Button>
              <Button
                compact
                mode={mode === "signUp" ? "contained" : "outlined"}
                onPress={() => setMode("signUp")}
              >
                Sign up
              </Button>
            </View>

            {mode === "signIn" ? <SignInForm /> : <SignUpForm onSwitchToSignIn={() => setMode("signIn")} />}
          </Card.Content>
        </Card>
      </View>
    </ScrollView>
  );
}

function SignInForm() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secondFactorCode, setSecondFactorCode] = useState("");
  const [secondFactor, setSecondFactor] = useState<SecondFactor | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    isLoaded &&
    !isSubmitting &&
    (secondFactor
      ? secondFactorCode.trim().length > 0
      : email.trim().length > 0 && password.length > 0);

  const submit = async () => {
    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (secondFactor) {
        const result = await signIn.attemptSecondFactor({
          strategy: secondFactor.strategy,
          code: secondFactorCode.trim()
        });

        if (result.status === "complete" && result.createdSessionId) {
          await setActive({ session: result.createdSessionId });
          return;
        }

        setError(`Sign-in needs another step: ${result.status}`);
        return;
      }

      const result = await signIn.create({
        identifier: email.trim(),
        password
      });

      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        return;
      }

      if (result.status === "needs_second_factor") {
        const selectedFactor = chooseSecondFactor(result.supportedSecondFactors ?? []);

        if (!selectedFactor) {
          setError("This account requires a second factor this MVP sign-in screen does not support yet.");
          return;
        }

        if (selectedFactor.needsPrepare) {
          await signIn.prepareSecondFactor(selectedFactor.prepareParams);
        }

        setSecondFactor(selectedFactor);
        setSecondFactorCode("");
        return;
      }

      setError(`Sign-in needs another step: ${result.status}`);
    } catch (caught) {
      setError(getClerkErrorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {secondFactor ? (
        <>
          <Text style={styles.authCopy}>{secondFactor.prompt}</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="number-pad"
            label="Verification code"
            mode="outlined"
            onChangeText={setSecondFactorCode}
            textContentType="oneTimeCode"
            value={secondFactorCode}
          />
          <Button
            mode="outlined"
            onPress={() => {
              setSecondFactor(null);
              setSecondFactorCode("");
              setError(null);
            }}
          >
            Back
          </Button>
        </>
      ) : (
        <>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            label="Email"
            mode="outlined"
            onChangeText={setEmail}
            textContentType="emailAddress"
            value={email}
          />
          <TextInput
            label="Password"
            mode="outlined"
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            value={password}
          />
        </>
      )}

      {error ? <Text style={styles.authError}>{error}</Text> : null}

      <Button mode="contained" disabled={!canSubmit} loading={isSubmitting} onPress={submit}>
        {secondFactor ? "Verify" : "Sign in"}
      </Button>
    </>
  );
}

function SignUpForm({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }) {
  const { isLoaded, signUp, setActive } = useSignUp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<SignUpStep>("details");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    isLoaded &&
    !isSubmitting &&
    (step === "details"
      ? email.trim().length > 0 && password.length >= 8
      : code.trim().length > 0);

  const submit = async () => {
    if (!canSubmit || !signUp || !setActive) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (step === "details") {
        const result = await signUp.create({
          emailAddress: email.trim(),
          password
        });

        if (result.status === "complete" && result.createdSessionId) {
          await setActive({ session: result.createdSessionId });
          return;
        }

        await result.prepareEmailAddressVerification({ strategy: "email_code" });
        setStep("verifyEmail");
        return;
      }

      const result = await signUp.attemptEmailAddressVerification({
        code: code.trim()
      });

      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        return;
      }

      setError(`Sign-up needs another step: ${result.status}`);
    } catch (caught) {
      setError(getClerkErrorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {step === "details" ? (
        <>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            label="Email"
            mode="outlined"
            onChangeText={setEmail}
            textContentType="emailAddress"
            value={email}
          />
          <TextInput
            label="Password"
            mode="outlined"
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
            value={password}
          />
          <Text style={styles.authHint}>Use at least 8 characters.</Text>
        </>
      ) : (
        <>
          <Text style={styles.authCopy}>Enter the verification code Clerk sent to {email.trim()}.</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="number-pad"
            label="Email verification code"
            mode="outlined"
            onChangeText={setCode}
            textContentType="oneTimeCode"
            value={code}
          />
          <Button
            mode="outlined"
            onPress={() => {
              setStep("details");
              setCode("");
              setError(null);
            }}
          >
            Edit email
          </Button>
        </>
      )}

      {error ? <Text style={styles.authError}>{error}</Text> : null}

      <Button mode="contained" disabled={!canSubmit} loading={isSubmitting} onPress={submit}>
        {step === "details" ? "Create account" : "Verify email"}
      </Button>
      <Button mode="text" onPress={onSwitchToSignIn}>
        I already have an account
      </Button>
    </>
  );
}

type AuthMode = "signIn" | "signUp";
type SignUpStep = "details" | "verifyEmail";

type SecondFactorStrategy = "totp" | "backup_code" | "phone_code" | "email_code";
type PrepareSecondFactorInput =
  | { strategy: "phone_code"; phoneNumberId: string }
  | { strategy: "email_code"; emailAddressId: string };
type SupportedSecondFactor = {
  strategy: SecondFactorStrategy | "email_link";
  phoneNumberId?: string;
  emailAddressId?: string;
  safeIdentifier?: string;
};
type SecondFactor = {
  strategy: SecondFactorStrategy;
  prompt: string;
} & (
  | {
      needsPrepare: true;
      prepareParams: PrepareSecondFactorInput;
    }
  | {
      needsPrepare: false;
      prepareParams?: never;
    }
);

function chooseSecondFactor(factors: SupportedSecondFactor[]) {
  const totp = factors.find((factor) => factor.strategy === "totp");
  if (totp) {
    return {
      strategy: "totp",
      prompt: "Enter the 6-digit code from your authenticator app.",
      needsPrepare: false
    } satisfies SecondFactor;
  }

  const phone = factors.find((factor) => factor.strategy === "phone_code");
  if (phone?.phoneNumberId) {
    return {
      strategy: "phone_code",
      prompt: `Enter the code sent to ${phone.safeIdentifier ?? "your phone"}.`,
      needsPrepare: true,
      prepareParams: { strategy: "phone_code", phoneNumberId: phone.phoneNumberId }
    } satisfies SecondFactor;
  }

  const email = factors.find((factor) => factor.strategy === "email_code");
  if (email?.emailAddressId) {
    return {
      strategy: "email_code",
      prompt: `Enter the code sent to ${email.safeIdentifier ?? "your email"}.`,
      needsPrepare: true,
      prepareParams: { strategy: "email_code", emailAddressId: email.emailAddressId }
    } satisfies SecondFactor;
  }

  const backupCode = factors.find((factor) => factor.strategy === "backup_code");
  if (backupCode) {
    return {
      strategy: "backup_code",
      prompt: "Enter one of your Clerk backup codes.",
      needsPrepare: false
    } satisfies SecondFactor;
  }

  return null;
}

function getClerkErrorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "errors" in error &&
    Array.isArray((error as { errors?: Array<{ longMessage?: string; message?: string }> }).errors)
  ) {
    const first = (error as { errors: Array<{ longMessage?: string; message?: string }> }).errors[0];
    return first?.longMessage ?? first?.message ?? "Sign-in failed.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Sign-in failed.";
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
  },
  authScreen: {
    alignItems: "center",
    backgroundColor: "#F5F7F9",
    justifyContent: "center",
    minHeight: "100%",
    padding: 20
  },
  authScroll: {
    backgroundColor: "#F5F7F9",
    flexGrow: 1
  },
  authCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    maxWidth: 460,
    width: "100%"
  },
  authContent: {
    gap: 16,
    paddingVertical: 24
  },
  authModeRow: {
    flexDirection: "row",
    gap: 10
  },
  authKicker: {
    color: "#19624A",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6
  },
  authTitle: {
    color: "#17202A",
    fontSize: 24,
    fontWeight: "800"
  },
  authCopy: {
    color: "#53616F",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8
  },
  authHint: {
    color: "#53616F",
    fontSize: 12,
    marginTop: -8
  },
  authError: {
    color: "#BA1A1A",
    fontSize: 14
  }
});
