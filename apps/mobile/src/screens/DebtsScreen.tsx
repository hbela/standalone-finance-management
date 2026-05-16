import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Card, Chip, Divider, List, ProgressBar, Text } from "react-native-paper";

import { AddLiabilityDialog } from "../components/AddLiabilityDialog";
import { EditLiabilityDialog } from "../components/EditLiabilityDialog";
import { Screen } from "../components/Screen";
import { SectionTitle } from "../components/SectionTitle";
import { StateCard } from "../components/StateCard";
import { useFinance, useFxSnapshot } from "../state/FinanceContext";
import { useFinanceTheme, type FinanceTheme } from "../theme";
import type { Liability } from "../data/types";
import { toBaseCurrencyAmount } from "../services/fxRates";
import { formatMoney } from "../utils/money";

export function DebtsScreen() {
  const theme = useFinanceTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const { liabilities, settings, isLoading, error, clearError } = useFinance();
  const fxSnapshot = useFxSnapshot(settings.baseCurrency);
  const [addLiabilityVisible, setAddLiabilityVisible] = useState(false);
  const [selectedLiability, setSelectedLiability] = useState<Liability | null>(null);
  const totalDebt = liabilities.reduce(
    (sum, liability) => sum + toBaseCurrencyAmount(liability.outstandingBalance, liability.currency, fxSnapshot),
    0
  );
  const monthlyCommitment = liabilities.reduce(
    (sum, liability) => sum + toBaseCurrencyAmount(liability.paymentAmount, liability.currency, fxSnapshot),
    0
  );

  return (
    <Screen>
      {isLoading ? (
        <StateCard title="Loading liabilities" detail="Fetching your loans and debt records from local storage." loading />
      ) : null}
      {error ? <StateCard title="Finance action failed" detail={error} tone="error" /> : null}

      <Card mode="contained" style={styles.summary}>
        <Card.Content>
          <Text variant="labelLarge" style={styles.summaryLabel}>
            Tracked liabilities
          </Text>
          <Text variant="headlineLarge" style={styles.summaryValue}>
            {formatMoney(totalDebt, settings.baseCurrency)}
          </Text>
          <Text variant="bodyMedium" style={styles.muted}>
            {formatMoney(monthlyCommitment, settings.baseCurrency)} committed each month
          </Text>
          <View style={styles.actionRow}>
            <Button mode="contained" icon="plus" onPress={() => setAddLiabilityVisible(true)}>
              Add liability
            </Button>
            <Button mode="outlined" icon="link-variant">
              Link payment
            </Button>
          </View>
        </Card.Content>
      </Card>

      <SectionTitle title="Loans And Mortgages" />
      {liabilities.length > 0 ? (
        <View style={styles.list}>
          {liabilities.map((liability) => {
            const progress =
              liability.originalPrincipal > 0
                ? 1 - liability.outstandingBalance / liability.originalPrincipal
                : 0;

            return (
              <Card
                key={liability.id}
                mode="contained"
                onPress={() => {
                  clearError();
                  setSelectedLiability(liability);
                }}
                style={styles.card}
              >
                <Card.Content style={styles.cardContent}>
                  <View style={styles.titleRow}>
                    <View style={styles.titleBlock}>
                      <Text variant="titleMedium" style={styles.title}>
                        {liability.name}
                      </Text>
                      <Text variant="bodySmall" style={styles.muted}>
                        {liability.institution}
                      </Text>
                    </View>
                    <Chip compact icon={liability.rateType === "fixed" ? "lock" : "chart-line"}>
                      {liability.rateType}
                    </Chip>
                  </View>

                  <View style={styles.balanceRow}>
                    <View>
                      <Text variant="labelMedium" style={styles.muted}>
                        Outstanding
                      </Text>
                      <Text variant="titleLarge">
                        {formatMoney(liability.outstandingBalance, liability.currency)}
                      </Text>
                    </View>
                    <View style={styles.paymentBlock}>
                      <Text variant="labelMedium" style={styles.muted}>
                        Payment
                      </Text>
                      <Text variant="titleMedium">
                        {formatMoney(liability.paymentAmount, liability.currency)}
                      </Text>
                    </View>
                  </View>

                  <ProgressBar progress={Math.max(progress, 0.02)} color={theme.colors.secondary} />
                  <View style={styles.detailGrid}>
                    <List.Item
                      title={`${liability.interestRate}%`}
                      description="Interest"
                      left={(props) => <List.Icon {...props} icon="percent" />}
                      style={styles.detailItem}
                    />
                    <Divider />
                    <List.Item
                      title={liability.nextDueDate}
                      description="Next due"
                      left={(props) => <List.Icon {...props} icon="calendar-clock" />}
                      style={styles.detailItem}
                    />
                  </View>
                </Card.Content>
              </Card>
            );
          })}
        </View>
      ) : (
        <StateCard title="No liabilities yet" detail="Add a loan, card balance, or mortgage to track debt payoff." />
      )}
      <AddLiabilityDialog visible={addLiabilityVisible} onDismiss={() => setAddLiabilityVisible(false)} />
      <EditLiabilityDialog
        liability={selectedLiability}
        visible={selectedLiability !== null}
        onDismiss={() => setSelectedLiability(null)}
      />
    </Screen>
  );
}

function createStyles(theme: FinanceTheme) {
  return StyleSheet.create({
  summary: {
    backgroundColor: theme.colors.secondaryContainer,
    borderRadius: theme.radius.lg
  },
  summaryLabel: {
    color: theme.colors.onSecondaryContainer
  },
  summaryValue: {
    color: theme.colors.onSecondaryContainer,
    fontWeight: "800",
    marginTop: theme.spacing.sm
  },
  muted: {
    color: theme.colors.onSurfaceVariant
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md
  },
  list: {
    gap: theme.spacing.md
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg
  },
  cardContent: {
    gap: theme.spacing.md
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.md,
    justifyContent: "space-between"
  },
  titleBlock: {
    flex: 1
  },
  title: {
    fontWeight: "700"
  },
  balanceRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  paymentBlock: {
    alignItems: "flex-end"
  },
  detailGrid: {
    borderColor: theme.colors.outlineVariant,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    overflow: "hidden"
  },
  detailItem: {
    paddingVertical: 0
  }
});
}
