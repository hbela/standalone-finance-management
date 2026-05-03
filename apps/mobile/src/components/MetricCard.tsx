import React from "react";
import { StyleSheet, View } from "react-native";
import { Card, Text } from "react-native-paper";

type MetricCardProps = {
  label: string;
  value: string;
  helper?: string;
  tone?: "primary" | "neutral" | "danger";
};

export function MetricCard({ label, value, helper, tone = "neutral" }: MetricCardProps) {
  return (
    <Card mode="contained" style={[styles.card, tone === "primary" && styles.primary]}>
      <Card.Content>
        <Text variant="labelMedium" style={[styles.label, tone === "primary" && styles.onPrimary]}>
          {label}
        </Text>
        <Text variant="headlineSmall" style={[styles.value, tone === "primary" && styles.onPrimary]}>
          {value}
        </Text>
        {helper ? (
          <Text variant="bodySmall" style={[styles.helper, tone === "primary" && styles.onPrimary]}>
            {helper}
          </Text>
        ) : null}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 150,
    backgroundColor: "#FFFFFF",
    borderRadius: 8
  },
  primary: {
    backgroundColor: "#19624A"
  },
  label: {
    color: "#58646E",
    marginBottom: 6
  },
  value: {
    color: "#14212B",
    fontWeight: "700"
  },
  helper: {
    color: "#58646E",
    marginTop: 4
  },
  onPrimary: {
    color: "#FFFFFF"
  }
});
