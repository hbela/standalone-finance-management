import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Card, Chip, Divider, List, Searchbar, SegmentedButtons, Text } from "react-native-paper";

import { AddTransactionDialog } from "../components/AddTransactionDialog";
import { EditTransactionDialog } from "../components/EditTransactionDialog";
import { ImportCsvDialog } from "../components/ImportCsvDialog";
import { Screen } from "../components/Screen";
import { SectionTitle } from "../components/SectionTitle";
import type { Transaction, TransactionType } from "../data/types";
import { useFinance } from "../state/FinanceContext";
import { formatSignedMoney } from "../utils/money";

const filterOptions = [
  { value: "all", label: "All" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
  { value: "debt", label: "Debt" }
];

export function TransactionsScreen() {
  const { transactions } = useFinance();
  const [addTransactionVisible, setAddTransactionVisible] = useState(false);
  const [importCsvVisible, setImportCsvVisible] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

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

  return (
    <Screen>
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
      <Card mode="contained" style={styles.card}>
        {visibleTransactions.map((transaction, index) => (
          <View key={transaction.id}>
            <List.Item
              title={transaction.merchant}
              description={`${transaction.category} . ${transaction.postedAt}`}
              onPress={() => setSelectedTransaction(transaction)}
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
              <Chip compact icon={transaction.source === "wise" ? "swap-horizontal" : "bank"}>
                {transaction.source.replace("_", " ")}
              </Chip>
              {transaction.isRecurring ? <Chip compact icon="repeat">Recurring</Chip> : null}
              {transaction.isExcludedFromReports ? <Chip compact icon="eye-off">Excluded</Chip> : null}
              {transaction.notes ? <Chip compact icon="note-text-outline">Notes</Chip> : null}
            </View>
            {index < visibleTransactions.length - 1 ? <Divider /> : null}
          </View>
        ))}
      </Card>
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
