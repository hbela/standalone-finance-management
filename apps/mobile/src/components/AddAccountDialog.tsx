import React, { useEffect, useMemo } from "react";
import { useForm } from "@tanstack/react-form";
import { ScrollView, StyleSheet } from "react-native";
import { Button, Dialog, HelperText, Portal, SegmentedButtons, TextInput } from "react-native-paper";
import { z } from "zod";

import type { Currency } from "../data/types";
import { type NewAccountInput, useFinance } from "../state/FinanceContext";
import { getFieldError, hasFieldError } from "../utils/formErrors";

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
  { label: "Manual", value: "manual" }
];

const currencyButtons = [
  { label: "EUR", value: "EUR" },
  { label: "HUF", value: "HUF" },
  { label: "USD", value: "USD" },
  { label: "GBP", value: "GBP" }
];

const addAccountSchema = z.object({
  name: z.string().trim().min(1, "Account name is required."),
  source: z.enum(["local_bank", "manual"]),
  currency: z.enum(["EUR", "HUF", "USD", "GBP"]),
  balance: z
    .string()
    .trim()
    .refine((value) => Number.isFinite(Number(value)), "Enter a valid balance.")
    .transform(Number)
});

type AddAccountForm = z.input<typeof addAccountSchema>;

export function AddAccountDialog({
  visible,
  onDismiss,
  initialBankId,
  initialCurrency = "EUR",
  initialName = "Manual account",
  initialSource = "manual"
}: AddAccountDialogProps) {
  const { addAccount } = useFinance();
  const defaultValues = useMemo<AddAccountForm>(
    () => ({
      name: initialName,
      source: initialSource,
      currency: initialCurrency,
      balance: "0"
    }),
    [initialCurrency, initialName, initialSource]
  );
  const form = useForm({
    defaultValues,
    validators: {
      onChange: addAccountSchema
    },
    onSubmit: async ({ value }) => {
      const account = addAccountSchema.parse(value);
      await addAccount({
        name: account.name,
        source: account.source,
        currency: account.currency,
        type: account.source === "manual" ? "cash" : "checking",
        currentBalance: account.balance,
        bankId: account.source === "local_bank" ? initialBankId : undefined
      });
      onDismiss();
    }
  });

  useEffect(() => {
    if (visible) {
      form.reset(defaultValues);
    }
  }, [defaultValues, form, visible]);

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title>Add Account</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView contentContainerStyle={styles.content}>
            <form.Field name="name">
              {(field) => (
                <>
                  <TextInput
                    error={hasFieldError(field.state.meta.errors)}
                    label="Account name"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChangeText={field.handleChange}
                    mode="outlined"
                  />
                  <HelperText type="error" visible={hasFieldError(field.state.meta.errors)}>
                    {getFieldError(field.state.meta.errors)}
                  </HelperText>
                </>
              )}
            </form.Field>
            <form.Field name="source">
              {(field) => (
                <SegmentedButtons
                  value={field.state.value}
                  onValueChange={(value) => field.handleChange(value as NewAccountInput["source"])}
                  buttons={sourceButtons}
                />
              )}
            </form.Field>
            <form.Field name="currency">
              {(field) => (
                <SegmentedButtons
                  value={field.state.value}
                  onValueChange={(value) => field.handleChange(value as Currency)}
                  buttons={currencyButtons}
                />
              )}
            </form.Field>
            <form.Field name="balance">
              {(field) => (
                <>
                  <TextInput
                    error={hasFieldError(field.state.meta.errors)}
                    label="Current balance"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChangeText={field.handleChange}
                    keyboardType="decimal-pad"
                    mode="outlined"
                  />
                  <HelperText type="error" visible={hasFieldError(field.state.meta.errors)}>
                    {getFieldError(field.state.meta.errors)}
                  </HelperText>
                </>
              )}
            </form.Field>
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Cancel</Button>
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <Button mode="contained" disabled={!canSubmit} loading={isSubmitting} onPress={() => void form.handleSubmit()}>
                Save
              </Button>
            )}
          </form.Subscribe>
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
