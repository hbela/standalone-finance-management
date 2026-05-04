import React, { useEffect, useMemo, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import { Button, Card, Chip, HelperText, List, SegmentedButtons, Text, TextInput } from "react-native-paper";

import { Screen } from "../components/Screen";
import { SectionTitle } from "../components/SectionTitle";
import { StateCard } from "../components/StateCard";
import type { Currency } from "../data/types";
import { useFinance } from "../state/FinanceContext";

type SettingsScreenProps = {
  onSignOut?: () => void;
};

const currencyButtons = [
  { label: "EUR", value: "EUR" },
  { label: "HUF", value: "HUF" },
  { label: "USD", value: "USD" },
  { label: "GBP", value: "GBP" }
];

export function SettingsScreen({ onSignOut }: SettingsScreenProps) {
  const { addCategory, archiveCategory, categories, clearError, error, isPersisted, settings, updateSettings } = useFinance();
  const [baseCurrency, setBaseCurrency] = useState<Currency>(settings.baseCurrency);
  const [locale, setLocale] = useState(settings.locale);
  const [categoryName, setCategoryName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const hasChanges = baseCurrency !== settings.baseCurrency || locale.trim() !== settings.locale;
  const normalizedCategoryName = categoryName.trim().replace(/\s+/g, " ");
  const categoryExists = categories.some(
    (category) => category.name.toLowerCase() === normalizedCategoryName.toLowerCase()
  );
  const localeError = useMemo(() => {
    if (locale.trim().length === 0) {
      return "Locale is required.";
    }

    try {
      new Intl.NumberFormat(locale.trim());
      return null;
    } catch {
      return "Enter a valid locale, such as en-US or hu-HU.";
    }
  }, [locale]);

  useEffect(() => {
    setBaseCurrency(settings.baseCurrency);
    setLocale(settings.locale);
  }, [settings]);

  return (
    <Screen>
      {error ? <StateCard title="Settings action failed" detail={error} tone="error" /> : null}

      <SectionTitle title="Settings" action={isPersisted ? "Convex" : "Local"} />
      <Card mode="contained" style={styles.card}>
        <Card.Content style={styles.content}>
          <View>
            <Text variant="labelLarge">Base currency</Text>
            <SegmentedButtons
              buttons={currencyButtons}
              onValueChange={(value) => {
                clearError();
                setBaseCurrency(value as Currency);
              }}
              value={baseCurrency}
            />
          </View>

          <View>
            <TextInput
              error={Boolean(localeError)}
              label="Locale"
              mode="outlined"
              onChangeText={(value) => {
                clearError();
                setLocale(value);
              }}
              value={locale}
            />
            <HelperText type={localeError ? "error" : "info"} visible>
              {localeError ?? "Used for dates, currencies, and regional formatting."}
            </HelperText>
          </View>

          <Button
            disabled={!hasChanges || Boolean(localeError) || isSaving}
            loading={isSaving}
            mode="contained"
            onPress={async () => {
              setIsSaving(true);
              try {
                await updateSettings({ baseCurrency, locale: locale.trim() });
              } finally {
                setIsSaving(false);
              }
            }}
          >
            Save settings
          </Button>
        </Card.Content>
      </Card>

      {isPersisted ? <AuthenticatedBankConnectionSection /> : <LocalBankConnectionSection />}

      <SectionTitle title="Categories" action={`${categories.length} active`} />
      <Card mode="contained" style={styles.card}>
        <Card.Content style={styles.content}>
          <View style={styles.categoryInputRow}>
            <TextInput
              label="New category"
              mode="outlined"
              onChangeText={(value) => {
                clearError();
                setCategoryName(value);
              }}
              style={styles.categoryInput}
              value={categoryName}
            />
            <Button
              disabled={normalizedCategoryName.length === 0 || categoryExists || isSavingCategory}
              loading={isSavingCategory}
              mode="contained"
              onPress={async () => {
                setIsSavingCategory(true);
                try {
                  await addCategory(normalizedCategoryName);
                  setCategoryName("");
                } finally {
                  setIsSavingCategory(false);
                }
              }}
            >
              Add
            </Button>
          </View>
          <HelperText type={categoryExists ? "error" : "info"} visible>
            {categoryExists ? "That category already exists." : "New categories appear in manual entries, edits, and CSV mapping."}
          </HelperText>
          <View style={styles.categoryGrid}>
            {categories.map((category) => (
              <Chip
                key={category.id}
                compact
                icon={category.isDefault ? "lock-outline" : "tag-outline"}
                onClose={category.isDefault ? undefined : () => archiveCategory(category.name)}
              >
                {category.name}
              </Chip>
            ))}
          </View>
        </Card.Content>
      </Card>

      <SectionTitle title="Session" />
      <Card mode="contained" style={styles.card}>
        <List.Item
          title={isPersisted ? "Signed in with Clerk" : "Local demo mode"}
          description={isPersisted ? "Finance data is saved in Convex." : "Records stay in this app session."}
          left={(props) => <List.Icon {...props} icon={isPersisted ? "shield-check" : "cellphone"} />}
        />
        {onSignOut ? (
          <Card.Actions>
            <Button icon="logout" mode="outlined" onPress={onSignOut}>
              Sign out
            </Button>
          </Card.Actions>
        ) : null}
      </Card>
    </Screen>
  );
}

function AuthenticatedBankConnectionSection() {
  const { getToken } = useAuth();
  const bankConnection = useBankConnection(getToken, true);

  return (
    <>
      <SectionTitle title="Bank Connection" action={bankConnection.statusLabel} />
      <Card mode="contained" style={styles.card}>
        <Card.Content style={styles.content}>
          <List.Item
            title="Tink bank aggregation"
            description={bankConnection.detail}
            left={(props) => <List.Icon {...props} icon={bankConnection.icon} />}
          />
          {bankConnection.error ? (
            <StateCard title="Bank connection action failed" detail={bankConnection.error} tone="error" />
          ) : null}
          <View style={styles.actionRow}>
            <Button
              disabled={bankConnection.isBusy}
              icon={bankConnection.isConnected ? "refresh" : "bank-plus"}
              loading={bankConnection.action === "connect"}
              mode={bankConnection.isConnected ? "outlined" : "contained"}
              onPress={bankConnection.connect}
            >
              {bankConnection.isConnected ? "Reconnect" : "Connect"}
            </Button>
            <Button
              disabled={!bankConnection.isConnected || bankConnection.isBusy}
              icon="sync"
              loading={bankConnection.action === "sync"}
              mode="contained"
              onPress={bankConnection.sync}
            >
              Sync
            </Button>
            <Button
              disabled={bankConnection.isBusy}
              icon="refresh"
              loading={bankConnection.action === "refresh"}
              mode="outlined"
              onPress={bankConnection.refresh}
            >
              Status
            </Button>
            <Button
              disabled={!bankConnection.isConnected || bankConnection.isBusy}
              icon="link-off"
              loading={bankConnection.action === "disconnect"}
              mode="outlined"
              onPress={bankConnection.disconnect}
            >
              Disconnect
            </Button>
          </View>
        </Card.Content>
      </Card>
    </>
  );
}

function LocalBankConnectionSection() {
  return (
    <>
      <SectionTitle title="Bank Connection" action="Local mode" />
      <Card mode="contained" style={styles.card}>
        <List.Item
          title="Tink bank aggregation"
          description="Sign in with Clerk and Convex to connect a bank."
          left={(props) => <List.Icon {...props} icon="bank-outline" />}
        />
      </Card>
    </>
  );
}

type TinkStatus = {
  connected: boolean;
  status: string;
  lastSyncedAt?: number;
  lastSyncStatus?: string;
  lastError?: string;
};

type BankAction = "connect" | "sync" | "refresh" | "disconnect" | null;

const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL;

function useBankConnection(
  getToken: ReturnType<typeof useAuth>["getToken"],
  isPersisted: boolean
) {
  const [status, setStatus] = useState<TinkStatus | null>(null);
  const [action, setAction] = useState<BankAction>(null);
  const [error, setError] = useState<string | null>(null);
  const isConnected = status?.connected ?? false;
  const isConfigured = Boolean(apiBaseUrl);

  const request = React.useCallback(
    async <T,>(path: string, init?: RequestInit) => {
      if (!apiBaseUrl) {
        throw new Error("Set EXPO_PUBLIC_API_URL to use bank connections.");
      }

      const token = await getToken();
      if (!token) {
        throw new Error("Sign in again before using bank connections.");
      }

      const response = await fetch(`${apiBaseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...init?.headers
        }
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload && typeof payload === "object" && "message" in payload
            ? String(payload.message)
            : "Bank connection request failed."
        );
      }

      return payload as T;
    },
    [getToken]
  );

  const run = React.useCallback(
    async (nextAction: BankAction, task: () => Promise<void>) => {
      setAction(nextAction);
      setError(null);

      try {
        await task();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Bank connection action failed.");
      } finally {
        setAction(null);
      }
    },
    []
  );

  const refresh = React.useCallback(
    async () =>
      run("refresh", async () => {
        setStatus(await request<TinkStatus>("/integrations/tink/status"));
      }),
    [request, run]
  );

  useEffect(() => {
    if (isPersisted && isConfigured) {
      void refresh();
    }
  }, [isConfigured, isPersisted, refresh]);

  return {
    action,
    error: !isConfigured && isPersisted ? "Set EXPO_PUBLIC_API_URL in .env.local." : error,
    icon: isConnected ? "bank-check" : "bank-outline",
    isBusy: action !== null,
    isConnected,
    statusLabel: status?.status ?? (isConfigured ? "Not connected" : "Not configured"),
    detail: getBankConnectionDetail(status, isPersisted, isConfigured),
    refresh,
    connect: () =>
      run("connect", async () => {
        const response = await request<{ url: string }>("/integrations/tink/link");
        await Linking.openURL(response.url);
      }),
    sync: () =>
      run("sync", async () => {
        await request("/integrations/tink/sync", { method: "POST" });
        setStatus(await request<TinkStatus>("/integrations/tink/status"));
      }),
    disconnect: () =>
      run("disconnect", async () => {
        await request("/integrations/tink/disconnect", { method: "POST" });
        setStatus(await request<TinkStatus>("/integrations/tink/status"));
      })
  };
}

function getBankConnectionDetail(
  status: TinkStatus | null,
  isPersisted: boolean,
  isConfigured: boolean
) {
  if (!isPersisted) {
    return "Sign in with Clerk and Convex to connect a bank.";
  }

  if (!isConfigured) {
    return "Set EXPO_PUBLIC_API_URL to enable the API-backed Tink flow.";
  }

  if (!status || status.status === "not_connected") {
    return "Connect a bank through Tink, then sync read-only accounts and posted transactions.";
  }

  const synced = status.lastSyncedAt
    ? `Last synced ${new Date(status.lastSyncedAt).toLocaleString()}.`
    : "No successful sync yet.";
  const failure = status.lastError ? ` ${status.lastError}` : "";

  return `${synced} Sync status: ${status.lastSyncStatus ?? "never_synced"}.${failure}`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8
  },
  content: {
    gap: 16
  },
  categoryInputRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  categoryInput: {
    flex: 1
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  }
});
