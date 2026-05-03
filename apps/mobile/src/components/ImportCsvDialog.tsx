import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Dialog, HelperText, List, Portal, SegmentedButtons, Text, TextInput } from "react-native-paper";

import { parseTransactionsCsv } from "../utils/csvImport";
import { useFinance } from "../state/FinanceContext";
import { formatSignedMoney } from "../utils/money";

type ImportCsvDialogProps = {
  visible: boolean;
  onDismiss: () => void;
  initialAccountId?: string;
};

const sampleCsv = `date,amount,currency,merchant,description,category,type
2026-05-02,-12990,HUF,Lidl,Groceries,Food,expense
2026-05-03,2500,EUR,Client invoice,May retainer,Freelance,income`;

export function ImportCsvDialog({ visible, onDismiss, initialAccountId }: ImportCsvDialogProps) {
  const { accounts, importTransactions } = useFinance();
  const [accountId, setAccountId] = useState(initialAccountId ?? accounts[0]?.id ?? "");
  const [csvText, setCsvText] = useState(sampleCsv);
  const [result, setResult] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const selectedAccount = accounts.find((account) => account.id === accountId) ?? accounts[0];
  const parsed = useMemo(
    () => (selectedAccount ? parseTransactionsCsv(csvText, selectedAccount) : { rows: [], errors: [] }),
    [csvText, selectedAccount]
  );
  const accountButtons = useMemo(
    () =>
      accounts.slice(0, 4).map((account) => ({
        label: account.name.length > 10 ? account.name.slice(0, 10) : account.name,
        value: account.id
      })),
    [accounts]
  );
  const canImport = Boolean(selectedAccount) && parsed.rows.length > 0;

  useEffect(() => {
    if (visible) {
      setAccountId(initialAccountId ?? accounts[0]?.id ?? "");
      setResult(null);
    }
  }, [accounts, initialAccountId, visible]);

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title>Import CSV</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView contentContainerStyle={styles.content}>
            <Text variant="labelLarge">Account</Text>
            <SegmentedButtons value={accountId} onValueChange={setAccountId} buttons={accountButtons} />
            <TextInput
              label="CSV rows"
              value={csvText}
              onChangeText={setCsvText}
              mode="outlined"
              multiline
              numberOfLines={8}
              style={styles.csvInput}
            />
            <HelperText type={parsed.errors.length > 0 ? "error" : "info"} visible>
              {parsed.errors[0] ??
                result ??
                `${parsed.rows.length} transaction rows ready. Duplicates are skipped on import.`}
            </HelperText>
            <View style={styles.preview}>
              {parsed.rows.slice(0, 3).map((row) => (
                <List.Item
                  key={row.dedupeHash}
                  title={row.merchant}
                  description={`${row.category} . ${row.postedAt}`}
                  left={(props) => <List.Icon {...props} icon={row.amount > 0 ? "arrow-down-circle" : "arrow-up-circle"} />}
                  right={() => (
                    <Text variant="labelLarge" style={row.amount > 0 ? styles.positive : styles.negative}>
                      {formatSignedMoney(row.amount, row.currency)}
                    </Text>
                  )}
                />
              ))}
            </View>
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Cancel</Button>
          <Button
            mode="contained"
            disabled={!canImport || isImporting}
            loading={isImporting}
            onPress={async () => {
              if (!selectedAccount) {
                return;
              }

              setIsImporting(true);
              try {
                const importResult = await importTransactions(selectedAccount.id, parsed.rows);
                setResult(`${importResult.imported} imported, ${importResult.skipped} skipped.`);
                if (importResult.imported > 0) {
                  onDismiss();
                }
              } finally {
                setIsImporting(false);
              }
            }}
          >
            Import
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    borderRadius: 8
  },
  content: {
    gap: 12,
    paddingVertical: 16
  },
  csvInput: {
    minHeight: 150
  },
  preview: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8
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
