import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Card, Chip, Divider, List, ProgressBar, Text } from "react-native-paper";

import { AddLiabilityDialog } from "../components/AddLiabilityDialog";
import { Screen } from "../components/Screen";
import { SectionTitle } from "../components/SectionTitle";
import { StateCard } from "../components/StateCard";
import { useFinance } from "../state/FinanceContext";
import { toBaseCurrency } from "../utils/finance";
import { formatMoney } from "../utils/money";

export function DebtsScreen() {
  const { liabilities, isLoading } = useFinance();
  const [addLiabilityVisible, setAddLiabilityVisible] = useState(false);
  const totalDebt = liabilities.reduce(
    (sum, liability) => sum + toBaseCurrency(liability.outstandingBalance, liability.currency),
    0
  );
  const monthlyCommitment = liabilities.reduce(
    (sum, liability) => sum + toBaseCurrency(liability.paymentAmount, liability.currency),
    0
  );

  return (
    <Screen>
      {isLoading ? (
        <StateCard title="Loading liabilities" detail="Fetching your loans and debt records from Convex." loading />
      ) : null}

      <Card mode="contained" style={styles.summary}>
        <Card.Content>
          <Text variant="labelLarge" style={styles.summaryLabel}>
            Tracked liabilities
          </Text>
          <Text variant="headlineLarge" style={styles.summaryValue}>
            {formatMoney(totalDebt, "EUR")}
          </Text>
          <Text variant="bodyMedium" style={styles.muted}>
            {formatMoney(monthlyCommitment, "EUR")} committed each month
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
              <Card key={liability.id} mode="contained" style={styles.card}>
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

                  <ProgressBar progress={Math.max(progress, 0.02)} color="#325B7C" />
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: {
    backgroundColor: "#EAF2F8",
    borderRadius: 8
  },
  summaryLabel: {
    color: "#325B7C"
  },
  summaryValue: {
    color: "#12344D",
    fontWeight: "800",
    marginTop: 8
  },
  muted: {
    color: "#65727D"
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 18
  },
  list: {
    gap: 12
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8
  },
  cardContent: {
    gap: 16
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
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
    borderColor: "#E2E8ED",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden"
  },
  detailItem: {
    paddingVertical: 0
  }
});
