import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Card, Chip, Divider, List, ProgressBar, Text } from "react-native-paper";

import { AddAccountDialog } from "../components/AddAccountDialog";
import { MetricCard } from "../components/MetricCard";
import { Screen } from "../components/Screen";
import { SectionTitle } from "../components/SectionTitle";
import { alerts, baseCurrency } from "../data/mockFinance";
import { useFinance } from "../state/FinanceContext";
import { getCurrencyExposure, getDashboardSummary } from "../utils/finance";
import { formatMoney } from "../utils/money";

export function DashboardScreen() {
  const [addAccountVisible, setAddAccountVisible] = useState(false);
  const { accounts, transactions, liabilities } = useFinance();
  const summary = getDashboardSummary(accounts, transactions, liabilities);
  const exposure = getCurrencyExposure(accounts);

  return (
    <Screen>
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

      <SectionTitle title="Cash By Account" action="Manage" />
      <Card mode="contained" style={styles.card}>
        {accounts.map((account, index) => (
          <View key={account.id}>
            <List.Item
              title={account.name}
              description={account.lastSyncedAt ?? "Manual balance"}
              left={(props) => (
                <List.Icon
                  {...props}
                  icon={account.source === "wise" ? "swap-horizontal-circle" : "bank"}
                />
              )}
              right={() => (
                <View style={styles.amountBlock}>
                  <Text variant="titleMedium">{formatMoney(account.currentBalance, account.currency)}</Text>
                  <Text variant="bodySmall" style={styles.muted}>
                    {account.source.replace("_", " ")}
                  </Text>
                </View>
              )}
            />
            {index < accounts.length - 1 ? <Divider /> : null}
          </View>
        ))}
      </Card>

      <SectionTitle title="Currency Exposure" />
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
                <ProgressBar progress={Math.min(item.baseAmount / summary.cash, 1)} color="#19624A" />
              </View>
            </View>
          ))}
        </Card.Content>
      </Card>

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
  muted: {
    color: "#65727D"
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
  }
});
