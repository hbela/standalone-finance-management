import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";

import { useFinanceTheme, type FinanceTheme } from "../theme";

type SectionTitleProps = {
  title: string;
  action?: string;
};

export function SectionTitle({ title, action }: SectionTitleProps) {
  const theme = useFinanceTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.row}>
      <Text variant="titleMedium" style={styles.title}>
        {title}
      </Text>
      {action ? <Text variant="labelLarge" style={styles.action}>{action}</Text> : null}
    </View>
  );
}

function createStyles(theme: FinanceTheme) {
  return StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  title: {
    color: theme.colors.onBackground,
    fontWeight: "700"
  },
  action: {
    color: theme.colors.primary
  }
});
}
