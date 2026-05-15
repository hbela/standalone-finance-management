import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Checkbox, Dialog, HelperText, List, Portal, SegmentedButtons, Text, TextInput } from "react-native-paper";

import { AccountPicker } from "./AccountPicker";
import {
  inspectTransactionsCsv,
  parseTransactionsCsv,
  type CsvDateFormat,
  type CsvFieldKey,
  type CsvFieldMapping
} from "../utils/csvImport";
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

const mappingFields: Array<{ key: CsvFieldKey; label: string; required?: boolean }> = [
  { key: "postedAt", label: "Date column", required: true },
  { key: "amount", label: "Amount column", required: true },
  { key: "currency", label: "Currency column" },
  { key: "merchant", label: "Merchant column" },
  { key: "description", label: "Description column" },
  { key: "category", label: "Category column" },
  { key: "type", label: "Type column" }
];

const dateFormatButtons: Array<{ label: string; value: CsvDateFormat }> = [
  { label: "Auto", value: "auto" },
  { label: "Y-M-D", value: "yyyy-mm-dd" },
  { label: "D/M/Y", value: "dd/mm/yyyy" },
  { label: "M/D/Y", value: "mm/dd/yyyy" }
];

export function ImportCsvDialog({ visible, onDismiss, initialAccountId }: ImportCsvDialogProps) {
  const { accounts, categories, importBatches, importTransactions, revertImportBatch } = useFinance();
  const [accountId, setAccountId] = useState(initialAccountId ?? accounts[0]?.id ?? "");
  const [csvText, setCsvText] = useState(sampleCsv);
  const [mapping, setMapping] = useState<CsvFieldMapping>({});
  const [dateFormat, setDateFormat] = useState<CsvDateFormat>("auto");
  const [isAccountConfirmed, setIsAccountConfirmed] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const selectedAccount = accounts.find((account) => account.id === accountId) ?? accounts[0];
  const inspected = useMemo(() => inspectTransactionsCsv(csvText), [csvText]);
  const parsed = useMemo(
    () =>
      selectedAccount
        ? parseTransactionsCsv(csvText, selectedAccount, { mapping, dateFormat, categories: categories.map((category) => category.name) })
        : { rows: [], errors: [], mapping: {}, dateFormat },
    [categories, csvText, dateFormat, mapping, selectedAccount]
  );
  const recentBatches = useMemo(
    () => importBatches.filter((batch) => batch.accountId === selectedAccount?.id).slice(0, 3),
    [importBatches, selectedAccount?.id]
  );
  const canImport = Boolean(selectedAccount) && isAccountConfirmed && parsed.rows.length > 0;

  useEffect(() => {
    if (visible) {
      setAccountId(initialAccountId ?? accounts[0]?.id ?? "");
      setResult(null);
      setIsAccountConfirmed(false);
    }
  }, [accounts, initialAccountId, visible]);

  useEffect(() => {
    setMapping(inspected.suggestedMapping);
    setDateFormat(inspected.suggestedDateFormat);
  }, [inspected.suggestedDateFormat, inspected.suggestedMapping]);

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title>Import CSV</Dialog.Title>
        <Dialog.ScrollArea style={styles.scrollArea}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            style={styles.scrollView}
          >
            <Text variant="labelLarge">Account</Text>
            <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} />
            <View style={styles.confirmRow}>
              <Checkbox
                status={isAccountConfirmed ? "checked" : "unchecked"}
                onPress={() => setIsAccountConfirmed((current) => !current)}
              />
              <Text variant="bodyMedium" style={styles.confirmText}>
                Import into {selectedAccount?.name ?? "selected account"}
              </Text>
            </View>
            <HelperText type="info" visible={!isAccountConfirmed}>
              Confirm the destination account to enable import.
            </HelperText>
            <TextInput
              label="CSV rows"
              value={csvText}
              onChangeText={setCsvText}
              mode="outlined"
              multiline
              numberOfLines={8}
              style={styles.csvInput}
            />
            <View style={styles.inspectCard}>
              <Text variant="labelLarge">Detected CSV</Text>
              <Text variant="bodySmall">
                {inspected.headers.length} columns, {inspected.rowCount} data rows, delimiter "{formatDelimiter(inspected.delimiter)}"
              </Text>
            </View>
            <Text variant="labelLarge">Field mapping</Text>
            <View style={styles.mappingGrid}>
              {mappingFields.map((field) => (
                <TextInput
                  key={field.key}
                  label={`${field.label}${field.required ? " *" : ""}`}
                  value={mapping[field.key] ?? ""}
                  onChangeText={(value) =>
                    setMapping((current) => ({
                      ...current,
                      [field.key]: value
                    }))
                  }
                  mode="outlined"
                  dense
                  placeholder={inspected.headers.join(", ")}
                />
              ))}
            </View>
            <Text variant="labelLarge">Date format</Text>
            <SegmentedButtons value={dateFormat} onValueChange={(value) => setDateFormat(value as CsvDateFormat)} buttons={dateFormatButtons} />
            <HelperText type={parsed.errors.length > 0 ? "error" : "info"} visible>
              {parsed.errors[0] ??
                result ??
                `${parsed.rows.length} transaction rows ready. Duplicates are skipped on import.`}
            </HelperText>
            <View style={styles.preview}>
              <Text variant="labelLarge" style={styles.previewTitle}>
                Preview
              </Text>
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
            {recentBatches.length > 0 ? (
              <View style={styles.preview}>
                <Text variant="labelLarge" style={styles.previewTitle}>
                  Recent imports
                </Text>
                {recentBatches.map((batch) => (
                  <List.Item
                    key={batch.id}
                    title={`${batch.importedCount} imported, ${batch.skippedCount} skipped`}
                    description={`${batch.sourceName ?? "CSV import"} . ${new Date(batch.createdAt).toLocaleDateString()} . ${batch.status}`}
                    left={(props) => <List.Icon {...props} icon={batch.status === "reverted" ? "backup-restore" : "file-check"} />}
                    right={() =>
                      batch.status === "completed" ? (
                        <Button compact onPress={() => revertImportBatch(batch.id)}>
                          Revert
                        </Button>
                      ) : null
                    }
                  />
                ))}
              </View>
            ) : null}
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
                const importResult = await importTransactions(selectedAccount.id, parsed.rows, {
                  rowCount: inspected.rowCount,
                  columnMapping: stringifyMapping(parsed.mapping),
                  dateFormat: parsed.dateFormat,
                  sourceName: "Pasted CSV"
                });
                setResult(`${importResult.imported} imported, ${importResult.skipped} skipped. Batch saved for review.`);
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

function stringifyMapping(mapping: CsvFieldMapping) {
  return Object.fromEntries(
    Object.entries(mapping).filter((entry): entry is [string, string] => Boolean(entry[1]))
  );
}

function formatDelimiter(delimiter: string) {
  return delimiter === "\t" ? "tab" : delimiter;
}

const styles = StyleSheet.create({
  dialog: {
    borderRadius: 8,
    maxHeight: "92%"
  },
  scrollArea: {
    flexShrink: 1,
    maxHeight: 620
  },
  scrollView: {
    flexGrow: 0
  },
  content: {
    gap: 12,
    paddingVertical: 16
  },
  csvInput: {
    minHeight: 150
  },
  confirmRow: {
    alignItems: "center",
    flexDirection: "row"
  },
  confirmText: {
    flex: 1
  },
  inspectCard: {
    backgroundColor: "#F6F8FA",
    borderRadius: 8,
    gap: 4,
    padding: 12
  },
  mappingGrid: {
    gap: 8
  },
  preview: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingTop: 8
  },
  previewTitle: {
    paddingHorizontal: 16
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
