import React, { useEffect, useMemo } from "react";
import { useForm } from "@tanstack/react-form";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Checkbox, Chip, Dialog, HelperText, Portal, Text, TextInput } from "react-native-paper";
import { z } from "zod";

import { transactionTypeOptions } from "../data/categories";
import type { Transaction, TransactionType } from "../data/types";
import { type UpdateTransactionInput, useFinance } from "../state/FinanceContext";
import { useFinanceTheme } from "../theme";
import { getFieldError, hasFieldError } from "../utils/formErrors";
import { formatSignedMoney } from "../utils/money";

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
  isExcludedFromReports: z.boolean(),
  transferMatchId: z.string().nullable()
});

type EditTransactionForm = z.input<typeof editTransactionSchema>;

export function EditTransactionDialog({ transaction, visible, onDismiss }: EditTransactionDialogProps) {
  const theme = useFinanceTheme();
  const { accounts, archiveTransaction, categories, transactions, updateTransaction } = useFinance();
  const accountNamesById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name])),
    [accounts]
  );
  const transferCandidates = useMemo(() => {
    if (!transaction) {
      return [];
    }

    return transactions
      .filter(
        (candidate) =>
          candidate.id !== transaction.id &&
          candidate.accountId !== transaction.accountId &&
          (!candidate.transferMatchId || candidate.transferMatchId === transaction.id) &&
          Math.sign(candidate.amount) !== Math.sign(transaction.amount)
      )
      .sort((left, right) => {
        const leftDateDistance = Math.abs(Date.parse(left.postedAt) - Date.parse(transaction.postedAt));
        const rightDateDistance = Math.abs(Date.parse(right.postedAt) - Date.parse(transaction.postedAt));
        const leftAmountDistance = Math.abs(Math.abs(left.baseCurrencyAmount) - Math.abs(transaction.baseCurrencyAmount));
        const rightAmountDistance = Math.abs(Math.abs(right.baseCurrencyAmount) - Math.abs(transaction.baseCurrencyAmount));
        return leftDateDistance - rightDateDistance || leftAmountDistance - rightAmountDistance;
      })
      .slice(0, 6);
  }, [transaction, transactions]);
  const defaultValues = useMemo<EditTransactionForm>(
    () => ({
      merchant: transaction?.merchant ?? "",
      description: transaction?.description ?? "",
      category: transaction?.category ?? "Other",
      type: transaction?.type ?? "expense",
      notes: transaction?.notes ?? "",
      isRecurring: transaction?.isRecurring ?? false,
      isExcludedFromReports: transaction?.isExcludedFromReports ?? false,
      transferMatchId: transaction?.transferMatchId ?? null
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
        isExcludedFromReports: parsed.transferMatchId ? true : parsed.isExcludedFromReports,
        transferMatchId: parsed.transferMatchId
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
                  {categories.map((category) => (
                    <Chip
                      key={category.id}
                      selected={field.state.value === category.name}
                      onPress={() => field.handleChange(category.name)}
                      compact
                    >
                      {category.name}
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
            <Text variant="labelLarge">Transfer match</Text>
            <form.Field name="transferMatchId">
              {(field) => (
                <View style={styles.chipGrid}>
                  <Chip selected={field.state.value === null} onPress={() => field.handleChange(null)} compact>
                    No match
                  </Chip>
                  {transferCandidates.map((candidate) => (
                    <Chip
                      key={candidate.id}
                      selected={field.state.value === candidate.id}
                      onPress={() => field.handleChange(candidate.id)}
                      compact
                      icon="swap-horizontal"
                    >
                      {formatTransferCandidateLabel(candidate, accountNamesById)}
                    </Chip>
                  ))}
                </View>
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
            textColor={theme.colors.error}
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

function formatTransferCandidateLabel(candidate: Transaction, accountNamesById: Map<string, string>) {
  const accountName = accountNamesById.get(candidate.accountId) ?? "Account";
  const shortAccountName = accountName.length > 18 ? `${accountName.slice(0, 17)}...` : accountName;
  return `${shortAccountName} . ${formatSignedMoney(candidate.amount, candidate.currency)} . ${candidate.postedAt.slice(5)}`;
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
