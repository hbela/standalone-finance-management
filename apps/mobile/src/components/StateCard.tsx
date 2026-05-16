import React from "react";
import { StyleSheet } from "react-native";
import { ActivityIndicator, Card, Text } from "react-native-paper";

import { useFinanceTheme, type FinanceTheme } from "../theme";

type StateCardProps = {
  title: string;
  detail: string;
  loading?: boolean;
  tone?: "default" | "error" | "warning";
};

export function StateCard({ title, detail, loading = false, tone = "default" }: StateCardProps) {
  const theme = useFinanceTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  return (
    <Card
      mode="contained"
      style={[
        styles.card,
        tone === "error" ? styles.errorCard : null,
        tone === "warning" ? styles.warningCard : null
      ]}
    >
      <Card.Content style={styles.content}>
        {loading ? <ActivityIndicator /> : null}
        <Text
          variant="titleSmall"
          style={[
            styles.title,
            tone === "error" ? styles.errorTitle : null,
            tone === "warning" ? styles.warningTitle : null
          ]}
        >
          {title}
        </Text>
        <Text variant="bodySmall" style={styles.detail}>
          {detail}
        </Text>
      </Card.Content>
    </Card>
  );
}

function createStyles(theme: FinanceTheme) {
  return StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg
  },
  content: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.lg
  },
  detail: {
    color: theme.colors.onSurfaceVariant,
    textAlign: "center"
  },
  errorCard: {
    backgroundColor: theme.colors.errorContainer
  },
  errorTitle: {
    color: theme.colors.onErrorContainer,
    textAlign: "center"
  },
  warningCard: {
    backgroundColor: theme.colors.tertiaryContainer
  },
  warningTitle: {
    color: theme.colors.onTertiaryContainer,
    fontWeight: "700",
    textAlign: "center"
  },
  title: {
    color: theme.colors.onSurface,
    fontWeight: "700",
    textAlign: "center"
  }
});
}
