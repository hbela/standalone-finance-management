import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Card, Chip, Divider, List, Searchbar, SegmentedButtons, Text } from "react-native-paper";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { AddTransactionDialog } from "../components/AddTransactionDialog";
import { EditTransactionDialog } from "../components/EditTransactionDialog";
import { ImportCsvDialog } from "../components/ImportCsvDialog";
import { Screen } from "../components/Screen";
import { SectionTitle } from "../components/SectionTitle";
import { StateCard } from "../components/StateCard";
import type { RecurringSubscriptionRow } from "../db/mappers";
import {
  archiveRecurringSubscription,
  confirmRecurringSubscription,
  dismissRecurringSubscription,
  listActiveRecurringSubscriptions,
} from "../services/sqlitePfm";
import type { Currency, Transaction, TransactionType } from "../data/types";
import { sqliteFinanceQueryKeys, useFinance } from "../state/FinanceContext";
import { formatSignedMoney } from "../utils/money";
import { detectRecurringCandidates, type RecurringCandidate } from "../utils/recurring";

const filterOptions = [
  { value: "all", label: "All" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
  { value: "debt", label: "Debt" }
];

export function TransactionsScreen() {
  const { transactions, isLoading, error, clearError, updateTransaction } = useFinance();
  const [addTransactionVisible, setAddTransactionVisible] = useState(false);
  const [importCsvVisible, setImportCsvVisible] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [dismissedRecurringCandidates, setDismissedRecurringCandidates] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const visibleTransactions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return transactions.filter((transaction) => {
      const matchesFilter =
        filter === "all" ||
        transaction.type === filter ||
        (filter === "debt" && ["loan_payment", "mortgage_payment"].includes(transaction.type));
      const matchesQuery =
        normalizedQuery.length === 0 ||
        transaction.merchant.toLowerCase().includes(normalizedQuery) ||
        transaction.category.toLowerCase().includes(normalizedQuery) ||
        transaction.description.toLowerCase().includes(normalizedQuery);

      return matchesFilter && matchesQuery;
    });
  }, [filter, query, transactions]);

  const recurringCandidates = useMemo(
    () =>
      detectRecurringCandidates(transactions)
        .filter((candidate) => !dismissedRecurringCandidates.includes(candidate.id))
        .slice(0, 3),
    [dismissedRecurringCandidates, transactions]
  );

  const subscriptionQuery = useQuery({
    queryKey: sqliteFinanceQueryKeys.recurringSubscriptions,
    queryFn: () => listActiveRecurringSubscriptions()
  });
  const subscriptionDocs = subscriptionQuery.data as RecurringSubscriptionRow[] | undefined;
  const subscriptions = useMemo(
    () =>
      (subscriptionDocs ?? [])
        .filter((subscription) => !subscription.archivedAt && !subscription.dismissedAt)
        .sort((left, right) => (right.lastSeenAt ?? 0) - (left.lastSeenAt ?? 0)),
    [subscriptionDocs]
  );
  const confirmRecurringCandidate = async (candidate: RecurringCandidate) => {
    await Promise.all(
      candidate.transactions.map((transaction) =>
        updateTransaction({
          id: transaction.id,
          category: transaction.category,
          type: transaction.type,
          merchant: transaction.merchant,
          description: transaction.description,
          notes: transaction.notes,
          isRecurring: true,
          isExcludedFromReports: transaction.isExcludedFromReports,
          transferMatchId: transaction.transferMatchId ?? null
        })
      )
    );
  };

  return (
    <Screen>
      {isLoading ? (
        <StateCard title="Loading ledger" detail="Fetching your transactions from SQLite." loading />
      ) : null}
      {error ? <StateCard title="Finance action failed" detail={error} tone="error" /> : null}

      <Searchbar
        placeholder="Search merchant, category, note"
        value={query}
        onChangeText={setQuery}
        style={styles.search}
      />
      <SegmentedButtons value={filter} onValueChange={setFilter} buttons={filterOptions} />

      <View style={styles.titleRow}>
        <SectionTitle title="Unified Ledger" action={`${visibleTransactions.length} items`} />
        <View style={styles.actions}>
          <Button mode="outlined" icon="file-upload-outline" onPress={() => setImportCsvVisible(true)}>
            Import
          </Button>
          <Button mode="contained" icon="plus" onPress={() => setAddTransactionVisible(true)}>
            Add
          </Button>
        </View>
      </View>
      {subscriptions.length > 0 ? (
        <Card mode="contained" style={styles.card}>
          <Card.Title
            title="Subscriptions"
            subtitle={`${subscriptions.length} active recurring ${subscriptions.length === 1 ? "payment" : "payments"}`}
            left={(props) => <List.Icon {...props} icon="repeat-variant" />}
          />
          {subscriptions.map((subscription, index) => (
            <View key={subscription.id}>
              <List.Item
                title={subscription.merchant}
                description={`${formatSubscriptionFrequency(subscription.frequency)} . ${subscription.transactionCount} payments . next around ${formatSubscriptionDate(subscription.nextExpectedAt ?? undefined)}`}
                left={(props) => <List.Icon {...props} icon="calendar-clock" />}
                right={() => (
                  <View style={styles.amountBlock}>
                    <Text variant="titleSmall" style={subscription.averageAmount > 0 ? styles.positive : styles.negative}>
                      {formatSignedMoney(subscription.averageAmount, asCurrency(subscription.currency))}
                    </Text>
                    <Text variant="bodySmall" style={styles.muted}>
                      {formatSignedMoney(subscription.monthlyAmount, asCurrency(subscription.currency))} / mo
                    </Text>
                  </View>
                )}
              />
              <View style={styles.metaRow}>
                {subscription.category ? (
                  <Chip compact icon="tag-outline">
                    {subscription.category}
                  </Chip>
                ) : null}
                <Chip compact icon={subscription.confidence === "high" ? "check-circle-outline" : "help-circle-outline"}>
                  {subscription.confidence} confidence
                </Chip>
                {subscription.confirmedAt ? <Chip compact icon="check">Confirmed</Chip> : null}
                {!subscription.confirmedAt ? (
                  <Button
                    compact
                    mode="contained-tonal"
                    icon="check"
                    onPress={() => void runPFMAction(() => confirmRecurringSubscription(subscription.id), queryClient)}
                  >
                    Confirm
                  </Button>
                ) : null}
                <Button
                  compact
                  mode="outlined"
                  icon="archive-outline"
                  onPress={() => void runPFMAction(() => archiveRecurringSubscription(subscription.id), queryClient)}
                >
                  Archive
                </Button>
                <Button
                  compact
                  mode="text"
                  icon="close"
                  onPress={() => void runPFMAction(() => dismissRecurringSubscription(subscription.id), queryClient)}
                >
                  Dismiss
                </Button>
              </View>
              {index < subscriptions.length - 1 ? <Divider /> : null}
            </View>
          ))}
        </Card>
      ) : null}
      {recurringCandidates.length > 0 ? (
        <Card mode="contained" style={styles.card}>
          <Card.Title
            title="Recurring Payment Review"
            subtitle={`${recurringCandidates.length} likely repeat ${recurringCandidates.length === 1 ? "payment" : "payments"}`}
            left={(props) => <List.Icon {...props} icon="calendar-sync" />}
          />
          {recurringCandidates.map((candidate, index) => (
            <View key={candidate.id}>
              <List.Item
                title={candidate.merchant}
                description={`${formatInterval(candidate.interval)} . ${candidate.transactions.length} payments . next around ${candidate.nextExpectedDate}`}
                left={(props) => <List.Icon {...props} icon="repeat" />}
                right={() => (
                  <View style={styles.amountBlock}>
                    <Text variant="titleSmall" style={candidate.averageAmount > 0 ? styles.positive : styles.negative}>
                      {formatSignedMoney(candidate.averageAmount, candidate.currency)}
                    </Text>
                    <Text variant="bodySmall" style={styles.muted}>
                      {candidate.confidence} confidence
                    </Text>
                  </View>
                )}
              />
              <View style={styles.metaRow}>
                <Chip compact icon="tag-outline">
                  {candidate.category}
                </Chip>
                <Button
                  compact
                  mode="outlined"
                  icon="eye-outline"
                  onPress={() => setSelectedTransaction(candidate.transactions[candidate.transactions.length - 1] ?? null)}
                >
                  Review
                </Button>
                <Button compact mode="contained-tonal" icon="check" onPress={() => void confirmRecurringCandidate(candidate)}>
                  Mark recurring
                </Button>
                <Button
                  compact
                  mode="text"
                  icon="close"
                  onPress={() => setDismissedRecurringCandidates((current) => [...current, candidate.id])}
                >
                  Dismiss
                </Button>
              </View>
              {index < recurringCandidates.length - 1 ? <Divider /> : null}
            </View>
          ))}
        </Card>
      ) : null}
      {visibleTransactions.length > 0 ? (
        <Card mode="contained" style={styles.card}>
          {visibleTransactions.map((transaction, index) => (
            <View key={transaction.id}>
              <List.Item
                title={transaction.merchant}
                description={`${transaction.category} . ${transaction.postedAt}`}
                onPress={() => {
                  clearError();
                  setSelectedTransaction(transaction);
                }}
                left={(props) => <List.Icon {...props} icon={iconForType(transaction.type)} />}
                right={() => (
                  <View style={styles.amountBlock}>
                    <Text
                      variant="titleSmall"
                      style={transaction.amount > 0 ? styles.positive : styles.negative}
                    >
                      {formatSignedMoney(transaction.amount, transaction.currency)}
                    </Text>
                    <Text variant="bodySmall" style={styles.muted}>
                      {formatSignedMoney(transaction.baseCurrencyAmount, "EUR")}
                    </Text>
                  </View>
                )}
              />
              <View style={styles.metaRow}>
                <Chip compact icon="bank">
                  {transaction.source.replace("_", " ")}
                </Chip>
                {transaction.isRecurring ? <Chip compact icon="repeat">Recurring</Chip> : null}
                {transaction.transferMatchId ? <Chip compact icon="swap-horizontal">Matched transfer</Chip> : null}
                {transaction.isExcludedFromReports ? <Chip compact icon="eye-off">Excluded</Chip> : null}
                {transaction.notes ? <Chip compact icon="note-text-outline">Notes</Chip> : null}
              </View>
              {index < visibleTransactions.length - 1 ? <Divider /> : null}
            </View>
          ))}
        </Card>
      ) : (
        <StateCard
          title={transactions.length > 0 ? "No matching transactions" : "No transactions yet"}
          detail={
            transactions.length > 0
              ? "Adjust the search or filter to bring transactions back into view."
              : "Add a transaction manually or import a CSV statement."
          }
        />
      )}
      <AddTransactionDialog visible={addTransactionVisible} onDismiss={() => setAddTransactionVisible(false)} />
      <ImportCsvDialog visible={importCsvVisible} onDismiss={() => setImportCsvVisible(false)} />
      <EditTransactionDialog
        transaction={selectedTransaction}
        visible={selectedTransaction !== null}
        onDismiss={() => setSelectedTransaction(null)}
      />
    </Screen>
  );
}

function formatInterval(interval: RecurringCandidate["interval"]) {
  switch (interval) {
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

async function runPFMAction(action: () => Promise<void>, queryClient: QueryClient) {
  await action();
  await queryClient.invalidateQueries({ queryKey: sqliteFinanceQueryKeys.root });
}

function formatSubscriptionFrequency(frequency: RecurringSubscriptionRow["frequency"]) {
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

function formatSubscriptionDate(epochMs: number | undefined) {
  if (typeof epochMs !== "number" || !Number.isFinite(epochMs)) {
    return "—";
  }
  return new Date(epochMs).toISOString().slice(0, 10);
}

function asCurrency(value: string): Currency {
  return value === "HUF" || value === "USD" || value === "GBP" ? value : "EUR";
}

function iconForType(type: TransactionType) {
  switch (type) {
    case "income":
      return "arrow-down-circle";
    case "transfer":
      return "swap-horizontal-circle";
    case "loan_payment":
    case "mortgage_payment":
      return "home-percent";
    case "refund":
      return "cash-refund";
    default:
      return "arrow-up-circle";
  }
}

const styles = StyleSheet.create({
  search: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8
  },
  titleRow: {
    gap: 10
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  amountBlock: {
    alignItems: "flex-end",
    justifyContent: "center"
  },
  positive: {
    color: "#19624A",
    fontWeight: "700"
  },
  negative: {
    color: "#8A3A24",
    fontWeight: "700"
  },
  muted: {
    color: "#65727D"
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 12,
    paddingHorizontal: 16
  }
});
