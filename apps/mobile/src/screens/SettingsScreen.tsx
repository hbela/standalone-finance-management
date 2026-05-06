import React, { useEffect, useMemo, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import { Button, Card, Chip, HelperText, List, SegmentedButtons, Text, TextInput } from "react-native-paper";

import type { BankConnectionReturn } from "../../App";
import { Screen } from "../components/Screen";
import { SectionTitle } from "../components/SectionTitle";
import { StateCard } from "../components/StateCard";
import type { Currency } from "../data/types";
import { useFinance } from "../state/FinanceContext";

type SettingsScreenProps = {
  bankConnectionReturn?: BankConnectionReturn | null;
  onBankConnectionReturnHandled?: () => void;
  onSignOut?: () => void;
};

const currencyButtons = [
  { label: "EUR", value: "EUR" },
  { label: "HUF", value: "HUF" },
  { label: "USD", value: "USD" },
  { label: "GBP", value: "GBP" }
];

export function SettingsScreen({
  bankConnectionReturn,
  onBankConnectionReturnHandled,
  onSignOut
}: SettingsScreenProps) {
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

      {isPersisted ? (
        <AuthenticatedBankConnectionSection
          bankConnectionReturn={bankConnectionReturn}
          onBankConnectionReturnHandled={onBankConnectionReturnHandled}
        />
      ) : (
        <LocalBankConnectionSection />
      )}

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

function AuthenticatedBankConnectionSection({
  bankConnectionReturn,
  onBankConnectionReturnHandled
}: {
  bankConnectionReturn?: BankConnectionReturn | null;
  onBankConnectionReturnHandled?: () => void;
}) {
  const { getToken } = useAuth();
  const bankConnection = useBankConnection(getToken, true, bankConnectionReturn, onBankConnectionReturnHandled);

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
          {bankConnection.needsReconnect ? (
            <StateCard
              title="Reconnect required"
              detail={
                bankConnection.reconnectReason ??
                "Tink credentials need to be re-authorized to keep syncing."
              }
              tone="warning"
            />
          ) : null}
          {bankConnection.error ? (
            <StateCard title="Bank connection action failed" detail={bankConnection.error} tone="error" />
          ) : null}
          <View style={styles.actionRow}>
            <Button
              disabled={bankConnection.isBusy}
              icon={
                bankConnection.needsReconnect
                  ? "alert"
                  : bankConnection.isConnected
                    ? "refresh"
                    : "bank-plus"
              }
              loading={bankConnection.action === "connect"}
              mode={
                bankConnection.needsReconnect || !bankConnection.isConnected
                  ? "contained"
                  : "outlined"
              }
              onPress={bankConnection.connect}
            >
              {bankConnection.needsReconnect
                ? "Reconnect now"
                : bankConnection.isConnected
                  ? "Reconnect"
                  : "Connect"}
            </Button>
            <Button
              disabled={
                !bankConnection.isConnected ||
                bankConnection.needsReconnect ||
                bankConnection.isBusy
              }
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

type BankAction = "connect" | "sync" | "refresh" | "disconnect" | null;

type TinkStatusResponse = {
  connected: boolean;
  status: string;
  lastSyncedAt?: number;
  lastSyncStatus?: string;
  lastError?: string;
};

type TinkSyncResponse = {
  accounts: {
    fetchedCount: number;
    importedCount: number;
    skippedCount: number;
    createdCount: number;
    updatedCount: number;
  };
  transactions: {
    fetchedCount: number;
    preparedCount: number;
    skippedBeforeImportCount: number;
    importedCount: number;
    skippedDuringImportCount: number;
  };
};

const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL;

function useBankConnection(
  getToken: ReturnType<typeof useAuth>["getToken"],
  isPersisted: boolean,
  bankConnectionReturn?: BankConnectionReturn | null,
  onBankConnectionReturnHandled?: () => void
) {
  const [statusLabel, setStatusLabel] = useState("Ready");
  const [detail, setDetail] = useState("Connect a bank through Tink, then sync read-only accounts and posted transactions.");
  const [action, setAction] = useState<BankAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [reconnectReason, setReconnectReason] = useState<string | null>(null);
  const isConfigured = Boolean(apiBaseUrl);
  const getTokenRef = React.useRef(getToken);

  React.useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const request = React.useCallback(
    async <T,>(path: string, init?: RequestInit) => {
      if (!apiBaseUrl) {
        throw new Error("Set EXPO_PUBLIC_API_URL to use bank connections.");
      }

      const token = await getTokenRef.current();
      if (!token) {
        throw new Error("Sign in again before using bank connections.");
      }

      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${token}`);

      if (init?.body !== undefined) {
        headers.set("Content-Type", "application/json");
      }

      const response = await fetch(`${apiBaseUrl}${path}`, {
        ...init,
        headers
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
    []
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

  const loadStatus = React.useCallback(async () => {
    const status = await request<TinkStatusResponse>("/integrations/tink/status");
    const isReconnect = status.status === "reconnect_required";
    setNeedsReconnect(isReconnect);
    setReconnectReason(isReconnect ? status.lastError ?? null : null);

    setIsConnected(status.connected && !isReconnect);

    if (isReconnect) {
      setStatusLabel("Reconnect required");
      setDetail(
        status.lastError
          ? `Tink reported an authentication error: ${status.lastError}`
          : "Tink credentials need to be re-authorized to keep syncing."
      );
      return;
    }

    setStatusLabel(status.connected ? "Connected" : "Ready");

    if (status.connected) {
      const syncDetail = status.lastSyncedAt
        ? `Last synced ${new Date(status.lastSyncedAt).toLocaleString()}.`
        : "Tink authorization completed. Sync to import accounts and posted transactions.";
      setDetail(syncDetail);
      return;
    }

    if (status.lastError) {
      setDetail(status.lastError);
      return;
    }

    setDetail("Connect a bank through Tink, then sync read-only accounts and posted transactions.");
  }, [request]);

  React.useEffect(() => {
    if (!isPersisted || !isConfigured) {
      return;
    }

    void loadStatus().catch(() => undefined);
  }, [isConfigured, isPersisted, loadStatus]);

  React.useEffect(() => {
    if (!bankConnectionReturn) {
      return;
    }

    if (bankConnectionReturn.status === "authorized") {
      setStatusLabel("Authorized");
      setIsConnected(true);
      setDetail("Tink authorization completed. Sync to import accounts and posted transactions.");
      void loadStatus().catch(() => undefined);
    } else {
      setStatusLabel("Authorization failed");
      setIsConnected(false);
      setError(bankConnectionReturn.message ?? "Tink authorization failed.");
    }

    onBankConnectionReturnHandled?.();
  }, [bankConnectionReturn, loadStatus, onBankConnectionReturnHandled]);

  const refresh = React.useCallback(() => {
    void run("refresh", loadStatus);
  }, [loadStatus, run]);

  return {
    action,
    error: !isConfigured && isPersisted ? "Set EXPO_PUBLIC_API_URL in .env.local." : error,
    icon: needsReconnect ? "bank-remove" : isConnected ? "bank-check" : "bank-outline",
    isBusy: action !== null,
    isConnected,
    needsReconnect,
    reconnectReason,
    statusLabel: isConfigured ? statusLabel : "Not configured",
    detail: getBankConnectionDetail(detail, isPersisted, isConfigured),
    refresh,
    connect: () =>
      run("connect", async () => {
        const response = await request<{ url: string }>("/integrations/tink/link");
        setStatusLabel(needsReconnect ? "Reconnect started" : "Authorization started");
        setIsConnected(false);
        await Linking.openURL(response.url);
      }),
    sync: () =>
      run("sync", async () => {
        const result = await request<TinkSyncResponse>("/integrations/tink/sync", { method: "POST" });
        setIsConnected(true);
        setNeedsReconnect(false);
        setReconnectReason(null);
        setStatusLabel("Synced");
        setDetail(formatSyncResult(result));
      }),
    disconnect: () =>
      run("disconnect", async () => {
        await request("/integrations/tink/disconnect", { method: "POST" });
        setIsConnected(false);
        setNeedsReconnect(false);
        setReconnectReason(null);
        setStatusLabel("Disconnected");
        setDetail("Connect a bank through Tink, then sync read-only accounts and posted transactions.");
      })
  };
}

function formatSyncResult(result: TinkSyncResponse) {
  const accountChangeCount = result.accounts.createdCount + result.accounts.updatedCount;
  const transactionSkippedCount =
    result.transactions.skippedBeforeImportCount + result.transactions.skippedDuringImportCount;

  return [
    `Sync complete ${new Date().toLocaleString()}.`,
    `${accountChangeCount} account ${accountChangeCount === 1 ? "change" : "changes"} (${result.accounts.createdCount} new, ${result.accounts.updatedCount} updated, ${result.accounts.skippedCount} skipped).`,
    `${result.transactions.importedCount} transaction${result.transactions.importedCount === 1 ? "" : "s"} imported (${result.transactions.fetchedCount} fetched, ${transactionSkippedCount} skipped).`
  ].join(" ");
}

function getBankConnectionDetail(
  detail: string,
  isPersisted: boolean,
  isConfigured: boolean
) {
  if (!isPersisted) {
    return "Sign in with Clerk and Convex to connect a bank.";
  }

  if (!isConfigured) {
    return "Set EXPO_PUBLIC_API_URL to enable the API-backed Tink flow.";
  }

  return detail;
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
