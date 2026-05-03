import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Checkbox, Dialog, Portal, SegmentedButtons, Text, TextInput } from "react-native-paper";

import { categoryOptions, transactionTypeOptions } from "../data/categories";
import type { TransactionType } from "../data/types";
import { useFinance } from "../state/FinanceContext";

type AddTransactionDialogProps = {
  visible: boolean;
  onDismiss: () => void;
};

export function AddTransactionDialog({ visible, onDismiss }: AddTransactionDialogProps) {
  const { accounts, addTransaction } = useFinance();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState("0");
  const [merchant, setMerchant] = useState("New merchant");
  const [description, setDescription] = useState("Manual transaction");
  const [category, setCategory] = useState("Other");
  const [type, setType] = useState<TransactionType>("expense");
  const [postedAt, setPostedAt] = useState(new Date().toISOString().slice(0, 10));
  const [isRecurring, setIsRecurring] = useState(false);

  const accountButtons = useMemo(
    () =>
      accounts.slice(0, 4).map((account) => ({
        label: account.name.length > 10 ? account.name.slice(0, 10) : account.name,
        value: account.id
      })),
    [accounts]
  );
  const canSave = accountId.length > 0 && Number.isFinite(Number(amount)) && merchant.trim().length > 0;

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title>Add Transaction</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView contentContainerStyle={styles.content}>
            <Text variant="labelLarge">Account</Text>
            <SegmentedButtons value={accountId} onValueChange={setAccountId} buttons={accountButtons} />
            <TextInput label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" mode="outlined" />
            <TextInput label="Merchant" value={merchant} onChangeText={setMerchant} mode="outlined" />
            <TextInput label="Description" value={description} onChangeText={setDescription} mode="outlined" />
            <TextInput label="Date" value={postedAt} onChangeText={setPostedAt} mode="outlined" />
            <SegmentedButtons value={type} onValueChange={(value) => setType(value as TransactionType)} buttons={transactionTypeOptions.slice(0, 4)} />
            <SegmentedButtons value={category} onValueChange={setCategory} buttons={categoryOptions.slice(0, 4).map((value) => ({ label: value, value }))} />
            <View style={styles.checkRow}>
              <Checkbox status={isRecurring ? "checked" : "unchecked"} onPress={() => setIsRecurring((current) => !current)} />
              <Text variant="bodyMedium">Mark as recurring</Text>
            </View>
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Cancel</Button>
          <Button
            mode="contained"
            disabled={!canSave}
            onPress={() => {
              addTransaction({
                accountId,
                amount: Number(amount),
                merchant: merchant.trim(),
                description: description.trim(),
                category,
                type,
                postedAt,
                isRecurring
              });
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
  checkRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  }
});
