import React from "react";
import { StyleSheet, View } from "react-native";
import { Button, Card, Text } from "react-native-paper";

import { useFinanceTheme, type FinanceTheme } from "../theme";

type AppLockScreenProps = {
  message?: string;
  error?: string | null;
  isAuthenticating: boolean;
  onUnlock: () => void;
};

export function AppLockScreen({ error, isAuthenticating, message, onUnlock }: AppLockScreenProps) {
  const theme = useFinanceTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <Card mode="contained" style={styles.card}>
        <Card.Content style={styles.content}>
          <View>
            <Text style={styles.kicker}>Standalone Finance Management</Text>
            <Text style={styles.title}>Unlock to continue</Text>
            <Text style={styles.copy}>
              {message ??
                "Your accounts and transactions live on this device. Authenticate to view them."}
            </Text>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            mode="contained"
            icon="fingerprint"
            loading={isAuthenticating}
            disabled={isAuthenticating}
            onPress={onUnlock}
          >
            Unlock
          </Button>
        </Card.Content>
      </Card>
    </View>
  );
}

function createStyles(theme: FinanceTheme) {
  return StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: theme.colors.background,
    flex: 1,
    justifyContent: "center",
    padding: theme.spacing.md,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    maxWidth: 460,
    width: "100%",
  },
  content: {
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.lg,
  },
  kicker: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: theme.spacing.xs,
  },
  title: {
    color: theme.colors.onSurface,
    fontSize: 24,
    fontWeight: "800",
  },
  copy: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 14,
    lineHeight: 20,
    marginTop: theme.spacing.sm,
  },
  error: {
    color: theme.colors.error,
    fontSize: 14,
  },
});
}
