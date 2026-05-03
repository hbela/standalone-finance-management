import React from "react";
import { StyleSheet } from "react-native";
import { ActivityIndicator, Card, Text } from "react-native-paper";

type StateCardProps = {
  title: string;
  detail: string;
  loading?: boolean;
  tone?: "default" | "error";
};

export function StateCard({ title, detail, loading = false, tone = "default" }: StateCardProps) {
  return (
    <Card mode="contained" style={[styles.card, tone === "error" ? styles.errorCard : null]}>
      <Card.Content style={styles.content}>
        {loading ? <ActivityIndicator /> : null}
        <Text variant="titleSmall" style={tone === "error" ? styles.errorTitle : styles.title}>
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
    fontWeight: "700",
    textAlign: "center"
  },
  title: {
    color: "#17202A",
    fontWeight: "700",
    textAlign: "center"
  }
});
