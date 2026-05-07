import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Card, Chip, Divider, List, ProgressBar, Text } from "react-native-paper";
import { useMutation, useQuery } from "convex/react";

import { AddAccountDialog } from "../components/AddAccountDialog";
import { EditAccountDialog } from "../components/EditAccountDialog";
import { MetricCard } from "../components/MetricCard";
import { Screen } from "../components/Screen";
import { SectionTitle } from "../components/SectionTitle";
import { StateCard } from "../components/StateCard";
import { api } from "../convexApi";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { alerts, baseCurrency } from "../data/mockFinance";
import type { Account } from "../data/types";
import { useFinance } from "../state/FinanceContext";
import { getAccountBalanceReconciliations, getCurrencyExposure, getDashboardSummary } from "../utils/finance";
import { formatMoney } from "../utils/money";

type IncomeStream = Doc<"incomeStreams">;
type ExpenseProfile = Doc<"expenseProfiles">;
type ForecastResult = {
  currency: "EUR" | "HUF" | "USD" | "GBP";
  horizonDays: number;
  startingBalance: number;
  endingBalance: number;
  totalInflow: number;
  totalOutflow: number;
  points: Array<{
    date: string;
    projectedBalance: number;
    expectedInflow: number;
    expectedOutflow: number;
  }>;
};

export function DashboardScreen() {
  const [addAccountVisible, setAddAccountVisible] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const { accounts, transactions, liabilities, isLoading, error, clearError } = useFinance();
  const summary = getDashboardSummary(accounts, transactions, liabilities);
  const exposure = getCurrencyExposure(accounts);
  const reconciliations = getAccountBalanceReconciliations(accounts, transactions);
  const unreconciledAccounts = reconciliations.filter((reconciliation) => reconciliation.needsReconciliation);
  const exposureDenominator = Math.max(Math.abs(summary.cash), 1);

  const incomeStreamDocs = useQuery(api.incomeStreams.listForCurrent) as IncomeStream[] | undefined;
  const incomeStreams = useMemo(
    () =>
      (incomeStreamDocs ?? [])
        .filter((stream) => !stream.archivedAt && !stream.dismissedAt)
        .sort((left, right) => (right.lastSeenAt ?? 0) - (left.lastSeenAt ?? 0)),
    [incomeStreamDocs]
  );
  const totalEstimatedMonthlyIncome = useMemo(
    () => incomeStreams.reduce((sum, stream) => sum + stream.monthlyAverage, 0),
    [incomeStreams]
  );
  const archiveIncomeStream = useMutation(api.incomeStreams.archive);
  const dismissIncomeStream = useMutation(api.incomeStreams.dismiss);
  const confirmIncomeStream = useMutation(api.incomeStreams.confirm);

  const expenseProfileDocs = useQuery(api.expenseProfiles.listForCurrent) as
    | ExpenseProfile[]
    | undefined;
  const expenseProfiles = useMemo(
    () =>
      (expenseProfileDocs ?? [])
        .filter((profile) => !profile.archivedAt && !profile.dismissedAt)
        .sort((left, right) => left.monthlyAverage - right.monthlyAverage),
    [expenseProfileDocs]
  );
  const totalEstimatedMonthlyExpenses = useMemo(
    () => expenseProfiles.reduce((sum, profile) => sum + Math.abs(profile.monthlyAverage), 0),
    [expenseProfiles]
  );
  const archiveExpenseProfile = useMutation(api.expenseProfiles.archive);
  const dismissExpenseProfile = useMutation(api.expenseProfiles.dismiss);

  const forecast = useQuery(api.forecast.getBalanceForecast, { horizonDays: 30 }) as
    | ForecastResult
    | undefined;
  const forecastHasContent = Boolean(
    forecast && (forecast.points.length > 0 || forecast.startingBalance !== 0)
  );
  const forecastDelta = forecast ? forecast.endingBalance - forecast.startingBalance : 0;

  return (
    <Screen>
      {isLoading ? (
        <StateCard title="Loading finance data" detail="Fetching your accounts, ledger, and liabilities from Convex." loading />
      ) : null}
      {error ? <StateCard title="Finance action failed" detail={error} tone="error" /> : null}
      {unreconciledAccounts.length > 0 ? (
        <StateCard
          title="Balance reconciliation needed"
          detail={`${unreconciledAccounts.length} ${unreconciledAccounts.length === 1 ? "account has" : "accounts have"} a stored balance that differs from its ledger total.`}
          tone="warning"
        />
      ) : null}

      <Card mode="contained" style={styles.hero}>
        <Card.Content>
          <Text variant="labelLarge" style={styles.heroLabel}>
            Net position in {baseCurrency}
          </Text>
          <Text variant="displaySmall" style={styles.heroValue}>
            {formatMoney(summary.netWorth, "EUR")}
          </Text>
          <Text variant="bodyMedium" style={styles.heroCopy}>
            {formatMoney(summary.cash, "EUR")} cash minus {formatMoney(summary.debt, "EUR")} tracked debt
          </Text>
          <View style={styles.heroActions}>
            <Button mode="contained-tonal" icon="bank-plus" onPress={() => setAddAccountVisible(true)}>
              Add account
            </Button>
            <Button mode="outlined" icon="sync">
              Sync Wise
            </Button>
          </View>
        </Card.Content>
      </Card>

      <View style={styles.metricGrid}>
        <MetricCard label="Income" value={formatMoney(summary.income, "EUR")} helper="Current month" tone="primary" />
        <MetricCard label="Expenses" value={formatMoney(summary.expenses, "EUR")} helper="Excluding debt" />
        <MetricCard label="Debt paid" value={formatMoney(summary.debtPayments, "EUR")} helper="Loans and mortgage" />
        <MetricCard label="Cash flow" value={formatMoney(summary.cashFlow, "EUR")} helper="After commitments" />
      </View>

      {forecast && forecastHasContent ? (
        <Card mode="contained" style={styles.forecastCard}>
          <Card.Content>
            <View style={styles.forecastHeader}>
              <View>
                <Text variant="labelLarge" style={styles.forecastLabel}>
                  Projected balance in {forecast.horizonDays} days
                </Text>
                <Text variant="displaySmall" style={styles.forecastValue}>
                  {formatMoney(forecast.endingBalance, forecast.currency)}
                </Text>
              </View>
              <Chip
                compact
                icon={forecastDelta >= 0 ? "trending-up" : "trending-down"}
                style={forecastDelta >= 0 ? styles.forecastUpChip : styles.forecastDownChip}
              >
                {`${forecastDelta >= 0 ? "+" : ""}${formatMoney(forecastDelta, forecast.currency)}`}
              </Chip>
            </View>
            <Text variant="bodyMedium" style={styles.forecastCopy}>
              Today {formatMoney(forecast.startingBalance, forecast.currency)} . expected{" "}
              <Text style={styles.positive}>+{formatMoney(forecast.totalInflow, forecast.currency)}</Text> in,{" "}
              <Text style={styles.negative}>-{formatMoney(forecast.totalOutflow, forecast.currency)}</Text> out
            </Text>
            <Text variant="bodySmall" style={styles.muted}>
              Forecast in {forecast.currency} only — multi-currency rollup coming with FX integration.
            </Text>
          </Card.Content>
        </Card>
      ) : null}

      {incomeStreams.length > 0 ? (
        <>
          <SectionTitle
            title="Income Streams"
            action={`${formatMoney(totalEstimatedMonthlyIncome, "EUR")} / mo est.`}
          />
          <Card mode="contained" style={styles.card}>
            {incomeStreams.map((stream, index) => (
              <View key={stream._id}>
                <List.Item
                  title={stream.employerName}
                  description={`${formatStreamFrequency(stream.frequency)} . ${stream.transactionCount} payments . next around ${formatStreamDate(stream.nextExpectedAt)}`}
                  left={(props) => <List.Icon {...props} icon="cash-multiple" />}
                  right={() => (
                    <View style={styles.amountBlock}>
                      <Text variant="titleSmall" style={styles.incomeAmount}>
                        {formatMoney(stream.averageAmount, stream.currency)}
                      </Text>
                      <Text variant="bodySmall" style={styles.muted}>
                        {formatMoney(stream.monthlyAverage, stream.currency)} / mo
                      </Text>
                    </View>
                  )}
                />
                <View style={styles.streamMetaRow}>
                  <Chip compact icon={stream.confidence === "high" ? "check-circle-outline" : "help-circle-outline"}>
                    {stream.confidence} confidence
                  </Chip>
                  {stream.confirmedAt ? <Chip compact icon="check">Confirmed</Chip> : null}
                  {!stream.confirmedAt ? (
                    <Button
                      compact
                      mode="contained-tonal"
                      icon="check"
                      onPress={() => void confirmIncomeStream({ streamId: stream._id })}
                    >
                      Confirm
                    </Button>
                  ) : null}
                  <Button
                    compact
                    mode="outlined"
                    icon="archive-outline"
                    onPress={() => void archiveIncomeStream({ streamId: stream._id })}
                  >
                    Archive
                  </Button>
                  <Button
                    compact
                    mode="text"
                    icon="close"
                    onPress={() => void dismissIncomeStream({ streamId: stream._id })}
                  >
                    Dismiss
                  </Button>
                </View>
                {index < incomeStreams.length - 1 ? <Divider /> : null}
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {expenseProfiles.length > 0 ? (
        <>
          <SectionTitle
            title="Expense Profile"
            action={`${formatMoney(totalEstimatedMonthlyExpenses, "EUR")} / mo est.`}
          />
          <Card mode="contained" style={styles.card}>
            {expenseProfiles.map((profile, index) => (
              <View key={profile._id}>
                <List.Item
                  title={profile.category}
                  description={`${profile.monthsObserved} ${profile.monthsObserved === 1 ? "month" : "months"} . ${profile.transactionCount} payments`}
                  left={(props) => <List.Icon {...props} icon="chart-pie" />}
                  right={() => (
                    <View style={styles.amountBlock}>
                      <Text variant="titleSmall" style={styles.expenseAmount}>
                        {formatMoney(Math.abs(profile.monthlyAverage), profile.currency)}
                      </Text>
                      <Text variant="bodySmall" style={styles.muted}>
                        avg / mo
                      </Text>
                    </View>
                  )}
                />
                <View style={styles.streamMetaRow}>
                  <Chip compact icon={profile.confidence === "high" ? "check-circle-outline" : "help-circle-outline"}>
                    {profile.confidence} confidence
                  </Chip>
                  <Button
                    compact
                    mode="outlined"
                    icon="archive-outline"
                    onPress={() => void archiveExpenseProfile({ profileId: profile._id })}
                  >
                    Archive
                  </Button>
                  <Button
                    compact
                    mode="text"
                    icon="close"
                    onPress={() => void dismissExpenseProfile({ profileId: profile._id })}
                  >
                    Dismiss
                  </Button>
                </View>
                {index < expenseProfiles.length - 1 ? <Divider /> : null}
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle title="Cash By Account" action="Manage" />
      {accounts.length > 0 ? (
        <Card mode="contained" style={styles.card}>
          {reconciliations.map((reconciliation, index) => (
            <View key={reconciliation.account.id}>
              <List.Item
                title={reconciliation.account.name}
                description={reconciliation.account.lastSyncedAt ?? "Manual balance"}
                onPress={() => {
                  clearError();
                  setSelectedAccount(reconciliation.account);
                }}
                left={(props) => (
                  <List.Icon
                    {...props}
                    icon={reconciliation.account.source === "wise" ? "swap-horizontal-circle" : "bank"}
                  />
                )}
                right={() => (
                  <View style={styles.amountBlock}>
                    <Text variant="titleMedium">
                      {formatMoney(reconciliation.account.currentBalance, reconciliation.account.currency)}
                    </Text>
                    <Text variant="bodySmall" style={styles.muted}>
                      {reconciliation.account.source.replace("_", " ")}
                    </Text>
                  </View>
                )}
              />
              <View style={styles.reconciliationRow}>
                <Chip compact icon={reconciliation.isBalanced ? "check-circle-outline" : "alert-circle-outline"}>
                  {reconciliation.isProviderSnapshot
                    ? "Bank snapshot"
                    : reconciliation.isBalanced
                      ? "Reconciled"
                      : "Needs reconciliation"}
                </Chip>
                <Text variant="bodySmall" style={reconciliation.isBalanced ? styles.muted : styles.warningText}>
                  Ledger {formatMoney(reconciliation.computedBalance, reconciliation.account.currency)}
                </Text>
                {!reconciliation.isBalanced ? (
                  <Text variant="bodySmall" style={styles.warningText}>
                    Difference {formatMoney(reconciliation.difference, reconciliation.account.currency)}
                  </Text>
                ) : null}
              </View>
              {index < reconciliations.length - 1 ? <Divider /> : null}
            </View>
          ))}
        </Card>
      ) : (
        <StateCard title="No accounts yet" detail="Add a manual account or import a CSV to start tracking balances." />
      )}

      <SectionTitle title="Currency Exposure" />
      {exposure.length > 0 ? (
        <Card mode="contained" style={styles.card}>
          <Card.Content style={styles.exposureList}>
            {exposure.map((item) => (
              <View key={`${item.currency}-${item.amount}`} style={styles.exposureRow}>
                <View style={styles.exposureLabel}>
                  <Chip compact>{item.currency}</Chip>
                  <Text variant="bodyMedium">{formatMoney(item.amount, item.currency)}</Text>
                </View>
                <View style={styles.exposureValue}>
                  <Text variant="labelLarge">{formatMoney(item.baseAmount, "EUR")}</Text>
                  <ProgressBar progress={Math.min(Math.abs(item.baseAmount) / exposureDenominator, 1)} color="#19624A" />
                </View>
              </View>
            ))}
          </Card.Content>
        </Card>
      ) : (
        <StateCard title="No currency exposure" detail="Currency exposure appears after at least one account is tracked." />
      )}

      <SectionTitle title="Alerts" />
      <View style={styles.alerts}>
        {alerts.map((alert) => (
          <Card key={alert.id} mode="contained" style={styles.alertCard}>
            <Card.Content style={styles.alertContent}>
              <List.Icon icon={alert.tone === "warning" ? "calendar-alert" : "check-circle-outline"} />
              <View style={styles.alertText}>
                <Text variant="titleSmall">{alert.title}</Text>
                <Text variant="bodySmall" style={styles.muted}>
                  {alert.detail}
                </Text>
              </View>
            </Card.Content>
          </Card>
        ))}
      </View>
      <AddAccountDialog visible={addAccountVisible} onDismiss={() => setAddAccountVisible(false)} />
      <EditAccountDialog
        account={selectedAccount}
        visible={selectedAccount !== null}
        onDismiss={() => setSelectedAccount(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: "#E6F3EC",
    borderRadius: 8
  },
  heroLabel: {
    color: "#19624A"
  },
  heroValue: {
    color: "#073827",
    fontWeight: "800",
    marginTop: 8
  },
  heroCopy: {
    color: "#325243",
    marginTop: 6
  },
  heroActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 18
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8
  },
  amountBlock: {
    alignItems: "flex-end",
    justifyContent: "center"
  },
  reconciliationRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 12,
    paddingHorizontal: 16
  },
  muted: {
    color: "#65727D"
  },
  warningText: {
    color: "#8A3A24"
  },
  exposureList: {
    gap: 14
  },
  exposureRow: {
    gap: 8
  },
  exposureLabel: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  exposureValue: {
    gap: 6
  },
  alerts: {
    gap: 10
  },
  alertCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8
  },
  alertContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  alertText: {
    flex: 1
  },
  streamMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 12,
    paddingHorizontal: 16
  },
  incomeAmount: {
    color: "#19624A",
    fontWeight: "700"
  },
  expenseAmount: {
    color: "#8A3A24",
    fontWeight: "700"
  },
  forecastCard: {
    backgroundColor: "#F4F8F6",
    borderRadius: 8
  },
  forecastHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  forecastLabel: {
    color: "#19624A"
  },
  forecastValue: {
    color: "#073827",
    fontWeight: "800",
    marginTop: 4
  },
  forecastCopy: {
    color: "#325243",
    marginTop: 8
  },
  forecastUpChip: {
    backgroundColor: "#D6EADF"
  },
  forecastDownChip: {
    backgroundColor: "#F4D8CD"
  },
  positive: {
    color: "#19624A",
    fontWeight: "700"
  },
  negative: {
    color: "#8A3A24",
    fontWeight: "700"
  }
});

function formatStreamFrequency(frequency: IncomeStream["frequency"]) {
  switch (frequency) {
    case "weekly":
      return "Weekly";
    case "biweekly":
      return "Every 2 weeks";
    case "quarterly":
      return "Quarterly";
    case "yearly":
      return "Yearly";
    default:
      return "Monthly";
  }
}

function formatStreamDate(epochMs: number | undefined) {
  if (typeof epochMs !== "number" || !Number.isFinite(epochMs)) {
    return "—";
  }
  return new Date(epochMs).toISOString().slice(0, 10);
}
