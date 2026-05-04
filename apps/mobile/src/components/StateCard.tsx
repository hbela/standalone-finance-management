import React from "react";
import { StyleSheet } from "react-native";
import { ActivityIndicator, Card, Text } from "react-native-paper";

type StateCardProps = {
  title: string;
  detail: string;
  loading?: boolean;
  tone?: "default" | "error" | "warning";
};

export function StateCard({ title, detail, loading = false, tone = "default" }: StateCardProps) {
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8
  },
  content: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 20
  },
  detail: {
    color: "#65727D",
    textAlign: "center"
  },
  errorCard: {
    backgroundColor: "#FFF1F0"
  },
  errorTitle: {
    color: "#BA1A1A",
    textAlign: "center"
  },
  warningCard: {
    backgroundColor: "#FFF7E8"
  },
  warningTitle: {
    color: "#8A3A24",
    fontWeight: "700",
    textAlign: "center"
  },
  title: {
    color: "#17202A",
    fontWeight: "700",
    textAlign: "center"
  }
});
