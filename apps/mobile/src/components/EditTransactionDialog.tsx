import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Checkbox, Chip, Dialog, Portal, Text, TextInput } from "react-native-paper";

import { categoryOptions, transactionTypeOptions } from "../data/categories";
import type { Transaction, TransactionType } from "../data/types";
import { type UpdateTransactionInput, useFinance } from "../state/FinanceContext";

type EditTransactionDialogProps = {
  transaction: Transaction | null;
  visible: boolean;
  onDismiss: () => void;
};

export function EditTransactionDialog({ transaction, visible, onDismiss }: EditTransactionDialogProps) {
  const { updateTransaction } = useFinance();
  const [merchant, setMerchant] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Other");
  const [type, setType] = useState<TransactionType>("expense");
  const [notes, setNotes] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [isExcludedFromReports, setIsExcludedFromReports] = useState(false);

  useEffect(() => {
    if (transaction && visible) {
      setMerchant(transaction.merchant);
      setDescription(transaction.description);
      setCategory(transaction.category);
      setType(transaction.type);
      setNotes(transaction.notes ?? "");
      setIsRecurring(transaction.isRecurring);
      setIsExcludedFromReports(transaction.isExcludedFromReports);
    }
  }, [transaction, visible]);

  const canSave = Boolean(transaction) && merchant.trim().length > 0 && description.trim().length > 0;

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title>Edit Transaction</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView contentContainerStyle={styles.content}>
            <TextInput label="Merchant" value={merchant} onChangeText={setMerchant} mode="outlined" />
            <TextInput label="Description" value={description} onChangeText={setDescription} mode="outlined" />
            <Text variant="labelLarge">Type</Text>
            <View style={styles.chipGrid}>
              {transactionTypeOptions.map((option) => (
                <Chip
                  key={option.value}
                  selected={type === option.value}
                  onPress={() => setType(option.value)}
                  compact
                >
                  {option.label}
                </Chip>
              ))}
            </View>
            <Text variant="labelLarge">Category</Text>
            <View style={styles.chipGrid}>
              {categoryOptions.map((option) => (
                <Chip key={option} selected={category === option} onPress={() => setCategory(option)} compact>
                  {option}
                </Chip>
              ))}
            </View>
            <TextInput label="Notes" value={notes} onChangeText={setNotes} mode="outlined" multiline />
            <View style={styles.checkRow}>
              <Checkbox status={isRecurring ? "checked" : "unchecked"} onPress={() => setIsRecurring((current) => !current)} />
              <Text variant="bodyMedium">Recurring</Text>
            </View>
            <View style={styles.checkRow}>
              <Checkbox
                status={isExcludedFromReports ? "checked" : "unchecked"}
                onPress={() => setIsExcludedFromReports((current) => !current)}
              />
              <Text variant="bodyMedium">Exclude from reports</Text>
            </View>
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Cancel</Button>
          <Button
            mode="contained"
            disabled={!canSave}
            onPress={() => {
              if (!transaction) {
                return;
              }

              const input: UpdateTransactionInput = {
                id: transaction.id,
                category,
                type,
                merchant: merchant.trim(),
                description: description.trim(),
                notes: notes.trim().length > 0 ? notes.trim() : undefined,
                isRecurring,
                isExcludedFromReports
              };
              updateTransaction(input);
              onDismiss();
            }}
          >
            Save
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
    gap: 14,
    paddingVertical: 16
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  checkRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  }
});
