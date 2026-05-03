import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";

type SectionTitleProps = {
  title: string;
  action?: string;
};

export function SectionTitle({ title, action }: SectionTitleProps) {
  return (
    <View style={styles.row}>
      <Text variant="titleMedium" style={styles.title}>
        {title}
      </Text>
      {action ? <Text variant="labelLarge" style={styles.action}>{action}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  title: {
    color: "#14212B",
    fontWeight: "700"
  },
  action: {
    color: "#19624A"
  }
});
