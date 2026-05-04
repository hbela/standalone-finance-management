import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { ImportCsvDialog } from "./ImportCsvDialog";
import { useFinance } from "../state/FinanceContext";

jest.mock("../state/FinanceContext", () => ({
  useFinance: jest.fn()
}));

jest.mock("react-native-paper", () => {
  const React = require("react");
  const { Pressable, Text, TextInput: NativeTextInput, View } = require("react-native");
  const createText = (children: React.ReactNode) => React.createElement(Text, null, children);

  const Dialog = ({ children, visible }: { children: React.ReactNode; visible: boolean }) =>
    visible ? React.createElement(View, null, children) : null;
  Dialog.Title = ({ children }: { children: React.ReactNode }) => createText(children);
  Dialog.ScrollArea = ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children);
  Dialog.Actions = ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children);

  return {
    Button: ({ children, disabled, onPress }: { children: React.ReactNode; disabled?: boolean; onPress?: () => void }) =>
      React.createElement(
        Pressable,
        { accessibilityRole: "button", disabled, onPress },
        React.createElement(Text, null, children)
      ),
    Checkbox: ({ onPress, status }: { onPress?: () => void; status: string }) =>
      React.createElement(
        Pressable,
        { accessibilityRole: "checkbox", onPress },
        React.createElement(Text, null, status)
      ),
    Dialog,
    HelperText: ({ children, visible = true }: { children: React.ReactNode; visible?: boolean }) =>
      visible ? createText(children) : null,
    List: {
      Icon: () => null,
      Item: ({
        description,
        right,
        title
      }: {
        description?: string;
        right?: () => React.ReactNode;
        title: string;
      }) =>
        React.createElement(
          View,
          null,
          createText(title),
          description ? createText(description) : null,
          right ? right() : null
        )
    },
    PaperProvider: ({ children }: { children: React.ReactNode }) => children,
    Portal: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children),
    SegmentedButtons: ({ buttons }: { buttons: Array<{ label: string; value: string }> }) =>
      React.createElement(
        View,
        null,
        buttons.map((button) => React.createElement(Text, { key: button.value }, button.label))
      ),
    Text,
    TextInput: ({
      label,
      onChangeText,
      placeholder,
      value
    }: {
      label: string;
      onChangeText?: (value: string) => void;
      placeholder?: string;
      value?: string;
    }) =>
      React.createElement(
        View,
        null,
        createText(label),
        React.createElement(NativeTextInput, { onChangeText, placeholder, value })
      )
  };
});

const financeState = {
  accounts: [
    {
      id: "checking",
      source: "manual",
      name: "Everyday",
      currency: "EUR",
      type: "checking",
      currentBalance: 0
    }
  ],
  categories: [
    { id: "Food", name: "Food", isDefault: true },
    { id: "Freelance", name: "Freelance", isDefault: true },
    { id: "Other", name: "Other", isDefault: true }
  ],
  importBatches: [
    {
      id: "batch-1",
      accountId: "checking",
      source: "csv",
      status: "completed",
      sourceName: "April statement",
      rowCount: 3,
      importedCount: 2,
      skippedCount: 1,
      columnMapping: { postedAt: "date", amount: "amount" },
      dateFormat: "yyyy-mm-dd",
      createdAt: "2026-05-04T10:00:00.000Z"
    }
  ],
  importTransactions: jest.fn(),
  revertImportBatch: jest.fn()
};

function renderDialog() {
  render(<ImportCsvDialog visible onDismiss={jest.fn()} initialAccountId="checking" />);
}

describe("ImportCsvDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useFinance as jest.Mock).mockReturnValue(financeState);
  });

  it("renders the CSV preview and recent import audit slice", () => {
    renderDialog();

    expect(screen.getByText("Detected CSV")).toBeTruthy();
    expect(screen.getByText(/7 columns, 2 data rows/)).toBeTruthy();
    expect(screen.getByText(/2 transaction rows ready/)).toBeTruthy();
    expect(screen.getByText("Recent imports")).toBeTruthy();
    expect(screen.getByText("2 imported, 1 skipped")).toBeTruthy();
  });

  it("allows a completed import batch to be reverted from review", () => {
    renderDialog();

    fireEvent.press(screen.getByText("Revert"));

    expect(financeState.revertImportBatch).toHaveBeenCalledWith("batch-1");
  });
});
