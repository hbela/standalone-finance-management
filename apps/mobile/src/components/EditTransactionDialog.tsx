import React, { useEffect, useMemo } from "react";
import { useForm } from "@tanstack/react-form";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Checkbox, Chip, Dialog, HelperText, Portal, Text, TextInput } from "react-native-paper";
import { z } from "zod";

import { categoryOptions, transactionTypeOptions } from "../data/categories";
import type { Transaction, TransactionType } from "../data/types";
import { type UpdateTransactionInput, useFinance } from "../state/FinanceContext";
import { getFieldError, hasFieldError } from "../utils/formErrors";

type EditTransactionDialogProps = {
  transaction: Transaction | null;
  visible: boolean;
  onDismiss: () => void;
};

const editTransactionSchema = z.object({
  merchant: z.string().trim().min(1, "Merchant is required."),
  description: z.string().trim().min(1, "Description is required."),
  category: z.string().trim().min(1, "Choose a category."),
  type: z.enum(["expense", "income", "transfer", "loan_payment", "mortgage_payment", "fee", "refund"]),
  notes: z.string(),
  isRecurring: z.boolean(),
  isExcludedFromReports: z.boolean()
});

type EditTransactionForm = z.input<typeof editTransactionSchema>;

export function EditTransactionDialog({ transaction, visible, onDismiss }: EditTransactionDialogProps) {
  const { archiveTransaction, updateTransaction } = useFinance();
  const defaultValues = useMemo<EditTransactionForm>(
    () => ({
      merchant: transaction?.merchant ?? "",
      description: transaction?.description ?? "",
      category: transaction?.category ?? "Other",
      type: transaction?.type ?? "expense",
      notes: transaction?.notes ?? "",
      isRecurring: transaction?.isRecurring ?? false,
      isExcludedFromReports: transaction?.isExcludedFromReports ?? false
    }),
    [transaction]
  );
  const form = useForm({
    defaultValues,
    validators: {
      onChange: editTransactionSchema
    },
    onSubmit: async ({ value }) => {
      if (!transaction) {
        return;
      }

      const parsed = editTransactionSchema.parse(value);
      const input: UpdateTransactionInput = {
        id: transaction.id,
        category: parsed.category,
        type: parsed.type,
        merchant: parsed.merchant,
        description: parsed.description,
        notes: parsed.notes.trim().length > 0 ? parsed.notes.trim() : undefined,
        isRecurring: parsed.isRecurring,
        isExcludedFromReports: parsed.isExcludedFromReports
      };
      await updateTransaction(input);
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
        <Dialog.Title>Edit Transaction</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView contentContainerStyle={styles.content}>
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
            <Text variant="labelLarge">Type</Text>
            <form.Field name="type">
              {(field) => (
                <View style={styles.chipGrid}>
                  {transactionTypeOptions.map((option) => (
                    <Chip
                      key={option.value}
                      selected={field.state.value === option.value}
                      onPress={() => field.handleChange(option.value as TransactionType)}
                      compact
                    >
                      {option.label}
                    </Chip>
                  ))}
                </View>
              )}
            </form.Field>
            <Text variant="labelLarge">Category</Text>
            <form.Field name="category">
              {(field) => (
                <View style={styles.chipGrid}>
                  {categoryOptions.map((option) => (
                    <Chip key={option} selected={field.state.value === option} onPress={() => field.handleChange(option)} compact>
                      {option}
                    </Chip>
                  ))}
                </View>
              )}
            </form.Field>
            <form.Field name="notes">
              {(field) => (
                <TextInput
                  label="Notes"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChangeText={field.handleChange}
                  mode="outlined"
                  multiline
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
                  <Text variant="bodyMedium">Recurring</Text>
                </View>
              )}
            </form.Field>
            <form.Field name="isExcludedFromReports">
              {(field) => (
                <View style={styles.checkRow}>
                  <Checkbox
                    status={field.state.value ? "checked" : "unchecked"}
                    onPress={() => field.handleChange(!field.state.value)}
                  />
                  <Text variant="bodyMedium">Exclude from reports</Text>
                </View>
              )}
            </form.Field>
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button
            disabled={!transaction}
            textColor="#BA1A1A"
            onPress={async () => {
              if (!transaction) {
                return;
              }

              await archiveTransaction(transaction.id);
              onDismiss();
            }}
          >
            Delete
          </Button>
          <Button onPress={onDismiss}>Cancel</Button>
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <Button
                mode="contained"
                disabled={!transaction || !canSubmit}
                loading={isSubmitting}
                onPress={() => void form.handleSubmit()}
              >
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
