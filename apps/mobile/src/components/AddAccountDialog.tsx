import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { Button, Dialog, Portal, SegmentedButtons, TextInput } from "react-native-paper";

import type { Currency } from "../data/types";
import { type NewAccountInput, useFinance } from "../state/FinanceContext";

type AddAccountDialogProps = {
  visible: boolean;
  onDismiss: () => void;
  initialBankId?: string;
  initialCurrency?: Currency;
  initialName?: string;
  initialSource?: NewAccountInput["source"];
};

const sourceButtons = [
  { label: "Bank", value: "local_bank" },
  { label: "Wise", value: "wise" },
  { label: "Manual", value: "manual" }
];

const currencyButtons = [
  { label: "EUR", value: "EUR" },
  { label: "HUF", value: "HUF" },
  { label: "USD", value: "USD" },
  { label: "GBP", value: "GBP" }
];

export function AddAccountDialog({
  visible,
  onDismiss,
  initialBankId,
  initialCurrency = "EUR",
  initialName = "Manual account",
  initialSource = "manual"
}: AddAccountDialogProps) {
  const { addAccount } = useFinance();
  const [name, setName] = useState(initialName);
  const [source, setSource] = useState<NewAccountInput["source"]>(initialSource);
  const [currency, setCurrency] = useState<Currency>(initialCurrency);
  const [balance, setBalance] = useState("0");

  const canSave = name.trim().length > 0 && Number.isFinite(Number(balance));

  useEffect(() => {
    if (visible) {
      setName(initialName);
      setSource(initialSource);
      setCurrency(initialCurrency);
      setBalance("0");
    }
  }, [initialCurrency, initialName, initialSource, visible]);

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title>Add Account</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView contentContainerStyle={styles.content}>
            <TextInput label="Account name" value={name} onChangeText={setName} mode="outlined" />
            <SegmentedButtons value={source} onValueChange={(value) => setSource(value as NewAccountInput["source"])} buttons={sourceButtons} />
            <SegmentedButtons value={currency} onValueChange={(value) => setCurrency(value as Currency)} buttons={currencyButtons} />
            <TextInput
              label="Current balance"
              value={balance}
              onChangeText={setBalance}
              keyboardType="decimal-pad"
              mode="outlined"
            />
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Cancel</Button>
          <Button
            mode="contained"
            disabled={!canSave}
            onPress={() => {
              addAccount({
                name: name.trim(),
                source,
                currency,
                type: source === "wise" ? "wise_balance" : source === "manual" ? "cash" : "checking",
                currentBalance: Number(balance),
                bankId: source === "local_bank" ? initialBankId : undefined
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
  }
});
