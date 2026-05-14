import React, { useEffect, useMemo } from "react";
import { useForm } from "@tanstack/react-form";
import { ScrollView, StyleSheet } from "react-native";
import { Button, Dialog, HelperText, Portal, SegmentedButtons, TextInput } from "react-native-paper";
import { z } from "zod";

import type { Account, Currency } from "../data/types";
import { type UpdateAccountInput, useFinance } from "../state/FinanceContext";
import { getFieldError, hasFieldError } from "../utils/formErrors";

type EditAccountDialogProps = {
  account: Account | null;
  visible: boolean;
  onDismiss: () => void;
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

const editAccountSchema = z.object({
  name: z.string().trim().min(1, "Account name is required."),
  source: z.enum(["local_bank", "manual"]),
  currency: z.enum(["EUR", "HUF", "USD", "GBP"]),
  balance: z
    .string()
    .trim()
    .refine((value) => Number.isFinite(Number(value)), "Enter a valid balance.")
    .transform(Number)
});

type EditAccountForm = z.input<typeof editAccountSchema>;

export function EditAccountDialog({ account, visible, onDismiss }: EditAccountDialogProps) {
  const { archiveAccount, updateAccount } = useFinance();
  const defaultValues = useMemo<EditAccountForm>(
    () => ({
      name: account?.name ?? "",
      source: account?.source ?? "manual",
      currency: account?.currency ?? "EUR",
      balance: account ? String(account.currentBalance) : "0"
    }),
    [account]
  );
  const form = useForm({
    defaultValues,
    validators: {
      onChange: editAccountSchema
    },
    onSubmit: async ({ value }) => {
      if (!account) {
        return;
      }

      const parsed = editAccountSchema.parse(value);
      const input: UpdateAccountInput = {
        id: account.id,
        name: parsed.name,
        source: parsed.source,
        currency: parsed.currency,
        type: parsed.source === "manual" ? "cash" : "checking",
        currentBalance: parsed.balance,
        bankId: parsed.source === "local_bank" ? account.bankId : undefined
      };

      await updateAccount(input);
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
        <Dialog.Title>Edit Account</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView contentContainerStyle={styles.content}>
            <form.Field name="name">
              {(field) => (
                <>
                  <TextInput
                    error={hasFieldError(field.state.meta.errors)}
                    label="Account name"
                    mode="outlined"
                    onBlur={field.handleBlur}
                    onChangeText={field.handleChange}
                    value={field.state.value}
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
                  buttons={sourceButtons}
                  onValueChange={(value) => field.handleChange(value as Account["source"])}
                  value={field.state.value}
                />
              )}
            </form.Field>
            <form.Field name="currency">
              {(field) => (
                <SegmentedButtons
                  buttons={currencyButtons}
                  onValueChange={(value) => field.handleChange(value as Currency)}
                  value={field.state.value}
                />
              )}
            </form.Field>
            <form.Field name="balance">
              {(field) => (
                <>
                  <TextInput
                    error={hasFieldError(field.state.meta.errors)}
                    keyboardType="decimal-pad"
                    label="Current balance"
                    mode="outlined"
                    onBlur={field.handleBlur}
                    onChangeText={field.handleChange}
                    value={field.state.value}
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
          <Button
            disabled={!account}
            textColor="#BA1A1A"
            onPress={async () => {
              if (!account) {
                return;
              }

              await archiveAccount(account.id);
              onDismiss();
            }}
          >
            Archive
          </Button>
          <Button onPress={onDismiss}>Cancel</Button>
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <Button
                disabled={!account || !canSubmit}
                loading={isSubmitting}
                mode="contained"
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
  }
});
