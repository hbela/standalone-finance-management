import React, { useEffect, useMemo } from "react";
import { useForm } from "@tanstack/react-form";
import { ScrollView, StyleSheet } from "react-native";
import { Button, Dialog, HelperText, Portal, SegmentedButtons, TextInput } from "react-native-paper";
import { z } from "zod";

import type { Currency, Liability } from "../data/types";
import { useFinance } from "../state/FinanceContext";
import { getFieldError, hasFieldError } from "../utils/formErrors";

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

const addLiabilitySchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  institution: z.string().trim().min(1, "Institution is required."),
  currency: z.enum(["EUR", "HUF", "USD", "GBP"]),
  outstandingBalance: z
    .string()
    .trim()
    .refine((value) => Number.isFinite(Number(value)), "Enter a valid outstanding balance.")
    .transform(Number),
  originalPrincipal: z
    .string()
    .trim()
    .refine((value) => Number.isFinite(Number(value)), "Enter a valid original principal.")
    .transform(Number),
  interestRate: z
    .string()
    .trim()
    .refine((value) => Number.isFinite(Number(value)), "Enter a valid interest rate.")
    .transform(Number),
  paymentAmount: z
    .string()
    .trim()
    .refine((value) => Number.isFinite(Number(value)), "Enter a valid payment amount.")
    .transform(Number),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD."),
  rateType: z.enum(["fixed", "variable"])
});

type AddLiabilityForm = z.input<typeof addLiabilitySchema>;

export function AddLiabilityDialog({ visible, onDismiss }: AddLiabilityDialogProps) {
  const { addLiability } = useFinance();
  const defaultValues = useMemo<AddLiabilityForm>(
    () => ({
      name: "New liability",
      institution: "Institution",
      currency: "EUR",
      outstandingBalance: "1000",
      originalPrincipal: "1000",
      interestRate: "5",
      paymentAmount: "100",
      nextDueDate: new Date().toISOString().slice(0, 10),
      rateType: "fixed"
    }),
    []
  );
  const form = useForm({
    defaultValues,
    validators: {
      onChange: addLiabilitySchema
    },
    onSubmit: async ({ value }) => {
      const liability = addLiabilitySchema.parse(value);
      await addLiability({
        name: liability.name,
        institution: liability.institution,
        type: "personal_loan",
        currency: liability.currency,
        originalPrincipal: liability.originalPrincipal,
        outstandingBalance: liability.outstandingBalance,
        interestRate: liability.interestRate,
        paymentAmount: liability.paymentAmount,
        nextDueDate: liability.nextDueDate,
        rateType: liability.rateType
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
        <Dialog.Title>Add Liability</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView contentContainerStyle={styles.content}>
            <form.Field name="name">
              {(field) => (
                <>
                  <TextInput
                    error={hasFieldError(field.state.meta.errors)}
                    label="Name"
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
            <form.Field name="institution">
              {(field) => (
                <>
                  <TextInput
                    error={hasFieldError(field.state.meta.errors)}
                    label="Institution"
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
            <form.Field name="currency">
              {(field) => (
                <SegmentedButtons
                  value={field.state.value}
                  onValueChange={(value) => field.handleChange(value as Currency)}
                  buttons={currencyButtons}
                />
              )}
            </form.Field>
            <form.Field name="rateType">
              {(field) => (
                <SegmentedButtons
                  value={field.state.value}
                  onValueChange={(value) => field.handleChange(value as Liability["rateType"])}
                  buttons={[
                    { label: "Fixed", value: "fixed" },
                    { label: "Variable", value: "variable" }
                  ]}
                />
              )}
            </form.Field>
            <form.Field name="originalPrincipal">
              {(field) => (
                <>
                  <TextInput
                    error={hasFieldError(field.state.meta.errors)}
                    label="Original principal"
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
            <form.Field name="outstandingBalance">
              {(field) => (
                <>
                  <TextInput
                    error={hasFieldError(field.state.meta.errors)}
                    label="Outstanding balance"
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
            <form.Field name="interestRate">
              {(field) => (
                <>
                  <TextInput
                    error={hasFieldError(field.state.meta.errors)}
                    label="Interest rate"
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
            <form.Field name="paymentAmount">
              {(field) => (
                <>
                  <TextInput
                    error={hasFieldError(field.state.meta.errors)}
                    label="Monthly payment"
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
            <form.Field name="nextDueDate">
              {(field) => (
                <>
                  <TextInput
                    error={hasFieldError(field.state.meta.errors)}
                    label="Next due date"
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
