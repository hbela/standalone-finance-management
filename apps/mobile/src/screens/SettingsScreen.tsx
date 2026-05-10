import React, { useEffect, useMemo, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import { useQuery } from "convex/react";
import { Button, Card, Chip, HelperText, List, SegmentedButtons, Text, TextInput } from "react-native-paper";

import type { BankConnectionReturn } from "../../App";
import { Screen } from "../components/Screen";
import { api } from "../convexApi";
import { SectionTitle } from "../components/SectionTitle";
import { StateCard } from "../components/StateCard";
import type { Currency } from "../data/types";
import { useMirror } from "../db/MirrorContext";
import type { ParityResult } from "../db/mirrorService";
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

      {isPersisted ? <AuthenticatedWiseConnectionSection /> : null}

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

      <DualWriteSection />

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

function DualWriteSection() {
  const { status, runParityCheck } = useMirror();
  const [isChecking, setIsChecking] = useState(false);
  const [results, setResults] = useState<ParityResult[] | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  if (!status.enabled) {
    return null;
  }

  const onRun = async () => {
    setIsChecking(true);
    setCheckError(null);
    try {
      const next = await runParityCheck();
      setResults(next);
    } catch (caught) {
      setCheckError(caught instanceof Error ? caught.message : "Parity check failed");
      setResults(null);
    } finally {
      setIsChecking(false);
    }
  };

  const lastMirrorLabel = status.lastMirroredAt
    ? `Last mirrored ${new Date(status.lastMirroredAt).toLocaleTimeString()}`
    : "No mirror runs yet";

  return (
    <>
      <SectionTitle title="SQLite mirror (dev)" />
      <Card mode="contained" style={styles.card}>
        <Card.Content style={styles.content}>
          <List.Item
            title={status.ready ? "Mirror ready" : "Mirror initializing…"}
            description={status.lastError ?? lastMirrorLabel}
            left={(props) => (
              <List.Icon
                {...props}
                icon={status.ready ? "database-check" : "database-sync"}
              />
            )}
          />

          <Button
            mode="outlined"
            icon="check-decagram"
            disabled={!status.ready || isChecking}
            loading={isChecking}
            onPress={() => {
              void onRun();
            }}
          >
            Run parity check
          </Button>

          {checkError ? (
            <HelperText type="error" visible>
              {checkError}
            </HelperText>
          ) : null}

          {results ? (
            <View style={{ gap: 6 }}>
              {results.map((row) => (
                <View
                  key={row.table}
                  style={{ flexDirection: "row", justifyContent: "space-between" }}
                >
                  <Text variant="bodyMedium">{row.table}</Text>
                  <Chip
                    compact
                    mode="outlined"
                    icon={row.matches ? "check" : "alert-circle"}
                  >
                    {`Convex ${row.convexCount} / SQLite ${row.sqliteCount}`}
                  </Chip>
                </View>
              ))}
            </View>
          ) : null}
        </Card.Content>
      </Card>
    </>
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
              disabled={
                !bankConnection.isConnected ||
                bankConnection.needsReconnect ||
                bankConnection.isBusy
              }
              icon="cloud-refresh"
              loading={bankConnection.action === "refreshCredentials"}
              mode="outlined"
              onPress={() => bankConnection.refreshCredentials()}
            >
              Refresh data
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
      <BankCredentialsList
        isBusy={bankConnection.isBusy}
        action={bankConnection.action}
        onRefresh={bankConnection.refreshCredentials}
        onExtend={bankConnection.extendConsent}
      />
    </>
  );
}

type CredentialRow = {
  id: string;
  credentialsId: string;
  providerName?: string;
  institutionName?: string;
  status: "connected" | "reconnect_required" | "temporary_error" | "unknown";
  statusCode?: string;
  consentExpiresAt?: number;
  sessionExtendable?: boolean;
};

function BankCredentialsList({
  isBusy,
  action,
  onRefresh,
  onExtend
}: {
  isBusy: boolean;
  action: BankAction;
  onRefresh: (credentialsId: string) => void;
  onExtend: (credentialsId: string) => void;
}) {
  const credentials = useQuery(api.tinkCredentials.listForCurrent) as CredentialRow[] | undefined;

  if (!credentials || credentials.length === 0) {
    return null;
  }

  return (
    <>
      <SectionTitle title="Connected banks" />
      {credentials.map((credential) => {
        const needsReconnect = credential.status === "reconnect_required";
        const isTemporary = credential.status === "temporary_error";
        const tone = needsReconnect ? "warning" : isTemporary ? "info" : "info";
        const title =
          credential.institutionName ??
          credential.providerName ??
          `Credential ${credential.credentialsId.slice(0, 8)}`;
        const expiresLabel = credential.consentExpiresAt
          ? `Consent expires ${new Date(credential.consentExpiresAt).toLocaleDateString()}.`
          : null;
        const statusDetail = needsReconnect
          ? `Reconnect required${credential.statusCode ? ` (${credential.statusCode})` : ""}.`
          : isTemporary
            ? "Temporary error from Tink. Refreshing usually resolves it."
            : credential.status === "unknown"
              ? `Unknown state${credential.statusCode ? ` (${credential.statusCode})` : ""}.`
              : "Connected.";

        return (
          <Card key={credential.id} mode="contained" style={styles.card}>
            <Card.Content style={styles.content}>
              <List.Item
                title={title}
                description={[statusDetail, expiresLabel].filter(Boolean).join(" ")}
                left={(props) => (
                  <List.Icon
                    {...props}
                    icon={needsReconnect ? "alert" : isTemporary ? "alert-circle-outline" : "bank-check"}
                  />
                )}
              />
              {tone === "warning" ? (
                <StateCard title="Reconnect needed" detail={statusDetail} tone="warning" />
              ) : null}
              <View style={styles.actionRow}>
                <Button
                  disabled={isBusy}
                  icon={needsReconnect ? "alert" : "cloud-refresh"}
                  loading={action === "refreshCredentials"}
                  mode={needsReconnect ? "contained" : "outlined"}
                  onPress={() => onRefresh(credential.credentialsId)}
                >
                  {needsReconnect ? "Reconnect" : "Refresh"}
                </Button>
                {credential.sessionExtendable && !needsReconnect ? (
                  <Button
                    disabled={isBusy}
                    icon="clock-plus-outline"
                    loading={action === "extendConsent"}
                    mode="outlined"
                    onPress={() => onExtend(credential.credentialsId)}
                  >
                    Extend consent
                  </Button>
                ) : null}
              </View>
            </Card.Content>
          </Card>
        );
      })}
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

type WiseStatusResponse = {
  connected: boolean;
  configured: boolean;
  environment: string;
  authMode?: "personal_token" | "oauth" | "unconfigured";
  oauthAvailable?: boolean;
  message?: string;
  connection?: {
    status: string;
    lastSyncedAt?: number;
    lastSyncStatus?: string;
    lastError?: string;
  } | null;
};

type WiseSyncResponse = {
  provider: "wise";
  profileCount: number;
  balanceCount: number;
  accountResult: { createdCount: number; updatedCount: number };
  transactionResult: { imported: number; updated: number; skipped: number };
};

type WiseAction = "connect" | "sync" | "disconnect" | "refresh" | null;

function AuthenticatedWiseConnectionSection() {
  const { getToken } = useAuth();
  const [status, setStatus] = useState<WiseStatusResponse | null>(null);
  const [action, setAction] = useState<WiseAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const isConfigured = Boolean(apiBaseUrl);

  const wiseRequest = React.useCallback(
    async <T,>(path: string, init?: RequestInit) => {
      if (!apiBaseUrl) {
        throw new Error("Set EXPO_PUBLIC_API_URL to use Wise.");
      }
      const token = await getToken();
      if (!token) throw new Error("Sign in again before using Wise.");
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${token}`);
      if (init?.body !== undefined) headers.set("Content-Type", "application/json");
      const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload && typeof payload === "object" && "message" in payload
            ? String(payload.message)
            : "Wise request failed."
        );
      }
      return payload as T;
    },
    [getToken]
  );

  const refresh = React.useCallback(async () => {
    setAction("refresh");
    setError(null);
    try {
      const next = await wiseRequest<WiseStatusResponse>("/integrations/wise/status");
      setStatus(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Wise status request failed.");
    } finally {
      setAction(null);
    }
  }, [wiseRequest]);

  useEffect(() => {
    if (isConfigured) void refresh();
  }, [isConfigured, refresh]);

  const connect = async () => {
    setAction("connect");
    setError(null);
    setInfo(null);
    try {
      const { url } = await wiseRequest<{ url: string }>("/integrations/wise/connect");
      const opened = await Linking.openURL(url);
      if (opened === false) {
        throw new Error("Could not open Wise authorization URL.");
      }
      setInfo("Authorize Wise in your browser, then return to this app.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Wise connect failed.");
    } finally {
      setAction(null);
    }
  };

  const sync = async () => {
    setAction("sync");
    setError(null);
    setInfo(null);
    try {
      const result = await wiseRequest<WiseSyncResponse>("/integrations/wise/sync", {
        method: "POST"
      });
      setInfo(
        `Synced ${result.profileCount} profile${result.profileCount === 1 ? "" : "s"}, ` +
          `${result.balanceCount} balance${result.balanceCount === 1 ? "" : "s"}; ` +
          `imported ${result.transactionResult.imported}, ` +
          `updated ${result.transactionResult.updated}, ` +
          `skipped ${result.transactionResult.skipped}.`
      );
      const next = await wiseRequest<WiseStatusResponse>("/integrations/wise/status");
      setStatus(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Wise sync failed.");
    } finally {
      setAction(null);
    }
  };

  const disconnect = async () => {
    setAction("disconnect");
    setError(null);
    try {
      await wiseRequest("/integrations/wise/disconnect", { method: "POST" });
      const next = await wiseRequest<WiseStatusResponse>("/integrations/wise/status");
      setStatus(next);
      setInfo("Wise disconnected.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Wise disconnect failed.");
    } finally {
      setAction(null);
    }
  };

  const isBusy = action !== null;
  const isConnected = Boolean(status?.connected);
  const oauthAvailable = Boolean(status?.oauthAvailable);
  const showConnect = oauthAvailable && (status?.authMode !== "oauth" || !isConnected);
  const helper = !isConfigured
    ? "Set EXPO_PUBLIC_API_URL to enable Wise sync."
    : status?.configured === false
      ? status.message ?? "Wise is not configured on the API yet."
      : status?.authMode === "oauth"
        ? "OAuth-token mode. Each user has their own Wise authorization."
        : status?.authMode === "personal_token"
          ? "Personal-token mode (sandbox dev). Connect via OAuth once the app is registered with Wise."
          : "Wise is not configured on the API yet.";

  return (
    <>
      <SectionTitle
        title="Wise"
        action={status?.environment ? `${status.environment}` : "wise"}
      />
      <Card mode="contained" style={styles.card}>
        <Card.Content style={styles.content}>
          <List.Item
            title="Wise wallet & statements"
            description={helper}
            left={(props) => <List.Icon {...props} icon="swap-horizontal-circle" />}
          />
          {info ? <StateCard title="Wise" detail={info} /> : null}
          {error ? <StateCard title="Wise action failed" detail={error} tone="error" /> : null}
          <View style={styles.actionRow}>
            {showConnect ? (
              <Button
                disabled={!isConfigured || isBusy}
                icon="bank-plus"
                loading={action === "connect"}
                mode="contained"
                onPress={connect}
              >
                {isConnected ? "Reconnect via Wise" : "Connect via Wise"}
              </Button>
            ) : null}
            <Button
              disabled={!isConfigured || isBusy || status?.configured === false}
              icon="sync"
              loading={action === "sync"}
              mode={showConnect ? "outlined" : "contained"}
              onPress={sync}
            >
              Sync
            </Button>
            <Button
              disabled={!isConfigured || isBusy}
              icon="refresh"
              loading={action === "refresh"}
              mode="outlined"
              onPress={refresh}
            >
              Status
            </Button>
            <Button
              disabled={!isConfigured || !isConnected || isBusy}
              icon="link-off"
              loading={action === "disconnect"}
              mode="outlined"
              onPress={disconnect}
            >
              Disconnect
            </Button>
          </View>
          {status?.connection?.lastSyncedAt ? (
            <Chip compact icon="check-circle-outline">
              Last synced {new Date(status.connection.lastSyncedAt).toLocaleString()}
            </Chip>
          ) : null}
        </Card.Content>
      </Card>
    </>
  );
}

type BankAction =
  | "connect"
  | "sync"
  | "refresh"
  | "refreshCredentials"
  | "extendConsent"
  | "disconnect"
  | null;

type TinkRefreshCredentialsResponse = {
  provider: "tink";
  credentialsId: string;
  method: "server_refresh" | "link";
  errorCode?: string;
  url?: string;
};

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
      }),
    refreshCredentials: (credentialsId?: string) =>
      run("refreshCredentials", async () => {
        const response = await request<TinkRefreshCredentialsResponse>(
          "/integrations/tink/refresh-credentials",
          {
            method: "POST",
            body: credentialsId ? JSON.stringify({ credentialsId }) : undefined
          }
        );

        if (response.method === "link" && response.url) {
          setStatusLabel("Re-authorization required");
          setDetail(
            response.errorCode
              ? `Tink needs you to re-authorize (${response.errorCode}). Opening secure flow…`
              : "Tink needs you to re-authorize. Opening secure flow…"
          );
          await Linking.openURL(response.url);
          return;
        }

        setStatusLabel("Refreshing");
        setDetail(
          "Refresh requested. Tink will deliver fresh data shortly; sync to see updates."
        );
      }),
    extendConsent: (credentialsId?: string) =>
      run("extendConsent", async () => {
        const path = credentialsId
          ? `/integrations/tink/extend-consent?credentialsId=${encodeURIComponent(credentialsId)}`
          : "/integrations/tink/extend-consent";
        const response = await request<{ url: string }>(path);
        await Linking.openURL(response.url);
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
