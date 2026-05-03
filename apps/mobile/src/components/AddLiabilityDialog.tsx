import React, { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { Button, Dialog, Portal, SegmentedButtons, TextInput } from "react-native-paper";

import type { Currency, Liability } from "../data/types";
import { useFinance } from "../state/FinanceContext";

type AddLiabilityDialogProps = {
  visible: boolean;
  onDismiss: () => void;
};

const currencyButtons = [
  { label: "EUR", value: "EUR" },
  { label: "HUF", value: "HUF" },
  { label: "USD", value: "USD" },
  { label: "GBP", value: "GBP" }
];

export function AddLiabilityDialog({ visible, onDismiss }: AddLiabilityDialogProps) {
  const { addLiability } = useFinance();
  const [name, setName] = useState("New liability");
  const [institution, setInstitution] = useState("Institution");
  const [currency, setCurrency] = useState<Currency>("EUR");
  const [outstandingBalance, setOutstandingBalance] = useState("1000");
  const [originalPrincipal, setOriginalPrincipal] = useState("1000");
  const [interestRate, setInterestRate] = useState("5");
  const [paymentAmount, setPaymentAmount] = useState("100");
  const [nextDueDate, setNextDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [rateType, setRateType] = useState<Liability["rateType"]>("fixed");

  const canSave =
    name.trim().length > 0 &&
    Number.isFinite(Number(outstandingBalance)) &&
    Number.isFinite(Number(originalPrincipal)) &&
    Number.isFinite(Number(paymentAmount));

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title>Add Liability</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView contentContainerStyle={styles.content}>
            <TextInput label="Name" value={name} onChangeText={setName} mode="outlined" />
            <TextInput label="Institution" value={institution} onChangeText={setInstitution} mode="outlined" />
            <SegmentedButtons value={currency} onValueChange={(value) => setCurrency(value as Currency)} buttons={currencyButtons} />
            <SegmentedButtons
              value={rateType}
              onValueChange={(value) => setRateType(value as Liability["rateType"])}
              buttons={[
                { label: "Fixed", value: "fixed" },
                { label: "Variable", value: "variable" }
              ]}
            />
            <TextInput label="Original principal" value={originalPrincipal} onChangeText={setOriginalPrincipal} keyboardType="decimal-pad" mode="outlined" />
            <TextInput label="Outstanding balance" value={outstandingBalance} onChangeText={setOutstandingBalance} keyboardType="decimal-pad" mode="outlined" />
            <TextInput label="Interest rate" value={interestRate} onChangeText={setInterestRate} keyboardType="decimal-pad" mode="outlined" />
            <TextInput label="Monthly payment" value={paymentAmount} onChangeText={setPaymentAmount} keyboardType="decimal-pad" mode="outlined" />
            <TextInput label="Next due date" value={nextDueDate} onChangeText={setNextDueDate} mode="outlined" />
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Cancel</Button>
          <Button
            mode="contained"
            disabled={!canSave}
            onPress={() => {
              addLiability({
                name: name.trim(),
                institution: institution.trim(),
                type: "personal_loan",
                currency,
                originalPrincipal: Number(originalPrincipal),
                outstandingBalance: Number(outstandingBalance),
                interestRate: Number(interestRate),
                paymentAmount: Number(paymentAmount),
                nextDueDate,
                rateType
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
