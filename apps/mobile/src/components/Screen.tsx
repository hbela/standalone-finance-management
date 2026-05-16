import React, { type ReactNode } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { useFinanceTheme, type FinanceTheme } from "../theme";

type ScreenProps = {
  children: ReactNode;
};

export function Screen({ children }: ScreenProps) {
  const theme = useFinanceTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.scroll}
    >
      {children}
    </ScrollView>
  );
}

function createStyles(theme: FinanceTheme) {
  return StyleSheet.create({
  scroll: {
    backgroundColor: theme.colors.background
  },
  content: {
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl
  }
});
}
