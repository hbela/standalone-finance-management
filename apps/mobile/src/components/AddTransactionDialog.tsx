import React, { useEffect, useMemo } from "react";
import { useForm } from "@tanstack/react-form";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Checkbox, Dialog, HelperText, Portal, SegmentedButtons, Text, TextInput } from "react-native-paper";
import { z } from "zod";

import { categoryOptions, transactionTypeOptions } from "../data/categories";
import type { TransactionType } from "../data/types";
import { useFinance } from "../state/FinanceContext";
import { getFieldError, hasFieldError } from "../utils/formErrors";

type AddTransactionDialogProps = {
  visible: boolean;
  onDismiss: () => void;
};

const addTransactionSchema = z.object({
  accountId: z.string().min(1, "Choose an account."),
  amount: z
    .string()
    .trim()
    .refine((value) => Number.isFinite(Number(value)), "Enter a valid amount.")
    .transform(Number),
  merchant: z.string().trim().min(1, "Merchant is required."),
  description: z.string().trim().min(1, "Description is required."),
  category: z.string().trim().min(1, "Choose a category."),
  type: z.enum(["expense", "income", "transfer", "loan_payment", "mortgage_payment", "fee", "refund"]),
  postedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD."),
  isRecurring: z.boolean()
});

type AddTransactionForm = z.input<typeof addTransactionSchema>;

export function AddTransactionDialog({ visible, onDismiss }: AddTransactionDialogProps) {
  const { accounts, addTransaction } = useFinance();
  const accountButtons = useMemo(
    () =>
      accounts.slice(0, 4).map((account) => ({
        label: account.name.length > 10 ? account.name.slice(0, 10) : account.name,
        value: account.id
      })),
    [accounts]
  );
  const defaultValues = useMemo<AddTransactionForm>(
    () => ({
      accountId: accounts[0]?.id ?? "",
      amount: "0",
      merchant: "New merchant",
      description: "Manual transaction",
      category: "Other",
      type: "expense",
      postedAt: new Date().toISOString().slice(0, 10),
      isRecurring: false
    }),
    [accounts]
  );
  const form = useForm({
    defaultValues,
    validators: {
      onChange: addTransactionSchema
    },
    onSubmit: async ({ value }) => {
      const transaction = addTransactionSchema.parse(value);
      await addTransaction(transaction);
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
        <Dialog.Title>Add Transaction</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView contentContainerStyle={styles.content}>
            <Text variant="labelLarge">Account</Text>
            <form.Field name="accountId">
              {(field) => (
                <>
                  <SegmentedButtons value={field.state.value} onValueChange={field.handleChange} buttons={accountButtons} />
                  <HelperText type="error" visible={hasFieldError(field.state.meta.errors)}>
                    {getFieldError(field.state.meta.errors)}
                  </HelperText>
                </>
              )}
            </form.Field>
            <form.Field name="amount">
              {(field) => (
                <>
                  <TextInput
                    error={hasFieldError(field.state.meta.errors)}
                    label="Amount"
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
            <form.Field name="merchant">
              {(field) => (
                <>
                  <TextInput
                    error={hasFieldError(field.state.meta.errors)}
                    label="Merchant"
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
            <form.Field name="description">
              {(field) => (
                <>
                  <TextInput
                    error={hasFieldError(field.state.meta.errors)}
                    label="Description"
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
            <form.Field name="postedAt">
              {(field) => (
                <>
                  <TextInput
                    error={hasFieldError(field.state.meta.errors)}
                    label="Date"
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
            <form.Field name="type">
              {(field) => (
                <SegmentedButtons
                  value={field.state.value}
                  onValueChange={(value) => field.handleChange(value as TransactionType)}
                  buttons={transactionTypeOptions.slice(0, 4)}
                />
              )}
            </form.Field>
            <form.Field name="category">
              {(field) => (
                <SegmentedButtons
                  value={field.state.value}
                  onValueChange={field.handleChange}
                  buttons={categoryOptions.slice(0, 4).map((value) => ({ label: value, value }))}
                />
              )}
            </form.Field>
            <form.Field name="isRecurring">
              {(field) => (
                <View style={styles.checkRow}>
                  <Checkbox
                    status={field.state.value ? "checked" : "unchecked"}
                    onPress={() => field.handleChange(!field.state.value)}
                  />
                  <Text variant="bodyMedium">Mark as recurring</Text>
                </View>
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
  },
  checkRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  }
});
