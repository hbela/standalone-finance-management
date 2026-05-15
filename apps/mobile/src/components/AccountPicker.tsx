import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Chip } from "react-native-paper";

import type { Account } from "../data/types";

type AccountPickerProps = {
  accounts: Account[];
  value: string;
  onChange: (accountId: string) => void;
};

export function AccountPicker({ accounts, value, onChange }: AccountPickerProps) {
  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const account of accounts) {
      const key = normalizeAccountName(account.name);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
  }, [accounts]);

  return (
    <View style={styles.grid}>
      {accounts.map((account) => (
        <Chip
          key={account.id}
          compact
          selected={value === account.id}
          onPress={() => onChange(account.id)}
          style={styles.chip}
        >
          {formatAccountLabel(account, duplicateNames)}
        </Chip>
      ))}
    </View>
  );
}

function formatAccountLabel(account: Account, duplicateNames: Set<string>) {
  const name = account.name.trim() || "Account";
  if (!duplicateNames.has(normalizeAccountName(name))) {
    return name;
  }
  const source = account.source === "manual" ? "Manual" : "Bank";
  return `${name} ${account.currency} ${source}`;
}

function normalizeAccountName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  chip: {
    maxWidth: "100%"
  }
});
