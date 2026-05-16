import React, { useEffect, useMemo } from "react";
import { useForm } from "@tanstack/react-form";
import { ScrollView, StyleSheet } from "react-native";
import { Button, Dialog, HelperText, Portal, SegmentedButtons, TextInput } from "react-native-paper";
import { z } from "zod";

import type { Currency, Liability } from "../data/types";
import { type UpdateLiabilityInput, useFinance } from "../state/FinanceContext";
import { useFinanceTheme } from "../theme";
import { getFieldError, hasFieldError } from "../utils/formErrors";

type EditLiabilityDialogProps = {
  liability: Liability | null;
  visible: boolean;
  onDismiss: () => void;
};

const currencyButtons = [
  { label: "EUR", value: "EUR" },
  { label: "HUF", value: "HUF" },
  { label: "USD", value: "USD" },
  { label: "GBP", value: "GBP" }
];

const editLiabilitySchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  institution: z.string().trim().min(1, "Institution is required."),
  currency: z.enum(["EUR", "HUF", "USD", "GBP"]),
  outstandingBalance: z.string().trim().refine((value) => Number.isFinite(Number(value)), "Enter a valid balance.").transform(Number),
  originalPrincipal: z.string().trim().refine((value) => Number.isFinite(Number(value)), "Enter a valid principal.").transform(Number),
  interestRate: z.string().trim().refine((value) => Number.isFinite(Number(value)), "Enter a valid interest rate.").transform(Number),
  paymentAmount: z.string().trim().refine((value) => Number.isFinite(Number(value)), "Enter a valid payment.").transform(Number),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD."),
  rateType: z.enum(["fixed", "variable"])
});

type EditLiabilityForm = z.input<typeof editLiabilitySchema>;

export function EditLiabilityDialog({ liability, visible, onDismiss }: EditLiabilityDialogProps) {
  const theme = useFinanceTheme();
  const { archiveLiability, updateLiability } = useFinance();
  const defaultValues = useMemo<EditLiabilityForm>(
    () => ({
      name: liability?.name ?? "",
      institution: liability?.institution ?? "",
      currency: liability?.currency ?? "EUR",
      outstandingBalance: liability ? String(liability.outstandingBalance) : "0",
      originalPrincipal: liability ? String(liability.originalPrincipal) : "0",
      interestRate: liability ? String(liability.interestRate) : "0",
      paymentAmount: liability ? String(liability.paymentAmount) : "0",
      nextDueDate: liability?.nextDueDate ?? new Date().toISOString().slice(0, 10),
      rateType: liability?.rateType ?? "fixed"
    }),
    [liability]
  );
  const form = useForm({
    defaultValues,
    validators: {
      onChange: editLiabilitySchema
    },
    onSubmit: async ({ value }) => {
      if (!liability) {
        return;
      }

      const parsed = editLiabilitySchema.parse(value);
      const input: UpdateLiabilityInput = {
        id: liability.id,
        name: parsed.name,
        institution: parsed.institution,
        type: liability.type,
        currency: parsed.currency,
        originalPrincipal: parsed.originalPrincipal,
        outstandingBalance: parsed.outstandingBalance,
        interestRate: parsed.interestRate,
        paymentAmount: parsed.paymentAmount,
        paymentFrequency: liability.paymentFrequency,
        nextDueDate: parsed.nextDueDate,
        rateType: parsed.rateType
      };

      await updateLiability(input);
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
        <Dialog.Title>Edit Liability</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView contentContainerStyle={styles.content}>
            <form.Field name="name">
              {(field) => (
                <>
                  <TextInput error={hasFieldError(field.state.meta.errors)} label="Name" mode="outlined" onBlur={field.handleBlur} onChangeText={field.handleChange} value={field.state.value} />
                  <HelperText type="error" visible={hasFieldError(field.state.meta.errors)}>{getFieldError(field.state.meta.errors)}</HelperText>
                </>
              )}
            </form.Field>
            <form.Field name="institution">
              {(field) => (
                <>
                  <TextInput error={hasFieldError(field.state.meta.errors)} label="Institution" mode="outlined" onBlur={field.handleBlur} onChangeText={field.handleChange} value={field.state.value} />
                  <HelperText type="error" visible={hasFieldError(field.state.meta.errors)}>{getFieldError(field.state.meta.errors)}</HelperText>
                </>
              )}
            </form.Field>
            <form.Field name="currency">
              {(field) => <SegmentedButtons buttons={currencyButtons} onValueChange={(value) => field.handleChange(value as Currency)} value={field.state.value} />}
            </form.Field>
            <form.Field name="rateType">
              {(field) => (
                <SegmentedButtons
                  buttons={[
                    { label: "Fixed", value: "fixed" },
                    { label: "Variable", value: "variable" }
                  ]}
                  onValueChange={(value) => field.handleChange(value as Liability["rateType"])}
                  value={field.state.value}
                />
              )}
            </form.Field>
            <form.Field name="originalPrincipal">
              {(field) => <NumberField field={field} label="Original principal" />}
            </form.Field>
            <form.Field name="outstandingBalance">
              {(field) => <NumberField field={field} label="Outstanding balance" />}
            </form.Field>
            <form.Field name="interestRate">
              {(field) => <NumberField field={field} label="Interest rate" />}
            </form.Field>
            <form.Field name="paymentAmount">
              {(field) => <NumberField field={field} label="Monthly payment" />}
            </form.Field>
            <form.Field name="nextDueDate">
              {(field) => (
                <>
                  <TextInput error={hasFieldError(field.state.meta.errors)} label="Next due date" mode="outlined" onBlur={field.handleBlur} onChangeText={field.handleChange} value={field.state.value} />
                  <HelperText type="error" visible={hasFieldError(field.state.meta.errors)}>{getFieldError(field.state.meta.errors)}</HelperText>
                </>
              )}
            </form.Field>
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button
            disabled={!liability}
            textColor={theme.colors.error}
            onPress={async () => {
              if (!liability) {
                return;
              }

              await archiveLiability(liability.id);
              onDismiss();
            }}
          >
            Archive
          </Button>
          <Button onPress={onDismiss}>Cancel</Button>
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <Button disabled={!liability || !canSubmit} loading={isSubmitting} mode="contained" onPress={() => void form.handleSubmit()}>
                Save
              </Button>
            )}
          </form.Subscribe>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

function NumberField({ field, label }: { field: { state: { value: string; meta: { errors: unknown[] } }; handleBlur: () => void; handleChange: (value: string) => void }; label: string }) {
  return (
    <>
      <TextInput
        error={hasFieldError(field.state.meta.errors)}
        keyboardType="decimal-pad"
        label={label}
        mode="outlined"
        onBlur={field.handleBlur}
        onChangeText={field.handleChange}
        value={field.state.value}
      />
      <HelperText type="error" visible={hasFieldError(field.state.meta.errors)}>
        {getFieldError(field.state.meta.errors)}
      </HelperText>
    </>
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
