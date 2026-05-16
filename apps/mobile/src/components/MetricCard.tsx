import React from "react";
import { StyleSheet, View } from "react-native";
import { Card, Text } from "react-native-paper";

import { useFinanceTheme, type FinanceTheme } from "../theme";

type MetricCardProps = {
  label: string;
  value: string;
  helper?: string;
  tone?: "primary" | "neutral" | "danger";
};

export function MetricCard({ label, value, helper, tone = "neutral" }: MetricCardProps) {
  const theme = useFinanceTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const isProminent = tone === "primary";

  return (
    <Card mode="contained" style={[styles.card, isProminent && styles.primary]}>
      <Card.Content>
        <Text variant="labelMedium" style={[styles.label, isProminent && styles.onPrimary]}>
          {label}
        </Text>
        <Text variant="headlineSmall" style={[styles.value, isProminent && styles.onPrimary]}>
          {value}
        </Text>
        {helper ? (
          <Text variant="bodySmall" style={[styles.helper, isProminent && styles.onPrimary]}>
            {helper}
          </Text>
        ) : null}
      </Card.Content>
    </Card>
  );
}

function createStyles(theme: FinanceTheme) {
  return StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 150,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg
  },
  primary: {
    backgroundColor: theme.finance.income
  },
  label: {
    color: theme.colors.onSurfaceVariant,
    marginBottom: theme.spacing.xs
  },
  value: {
    color: theme.colors.onSurface,
    fontWeight: "700"
  },
  helper: {
    color: theme.colors.onSurfaceVariant,
    marginTop: theme.spacing.xs
  },
  onPrimary: {
    color: theme.finance.onIncome
  }
});
}
