import React from "react";
import { StyleSheet, View } from "react-native";
import { Button, Card, Text } from "react-native-paper";

type AppLockScreenProps = {
  message?: string;
  error?: string | null;
  isAuthenticating: boolean;
  onUnlock: () => void;
};

export function AppLockScreen({ error, isAuthenticating, message, onUnlock }: AppLockScreenProps) {
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

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: "#F5F7F9",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    maxWidth: 460,
    width: "100%",
  },
  content: {
    gap: 16,
    paddingVertical: 24,
  },
  kicker: {
    color: "#19624A",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
  },
  title: {
    color: "#17202A",
    fontSize: 24,
    fontWeight: "800",
  },
  copy: {
    color: "#53616F",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  error: {
    color: "#BA1A1A",
    fontSize: 14,
  },
});
