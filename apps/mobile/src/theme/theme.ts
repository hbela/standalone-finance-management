import { MD3LightTheme, type MD3Theme } from "react-native-paper";

export const financeTheme: MD3Theme = {
  ...MD3LightTheme,
  roundness: 2,
  colors: {
    ...MD3LightTheme.colors,
    primary: "#19624A",
    onPrimary: "#FFFFFF",
    primaryContainer: "#CDEBDD",
    onPrimaryContainer: "#073827",
    secondary: "#325B7C",
    onSecondary: "#FFFFFF",
    secondaryContainer: "#D4E8F7",
    onSecondaryContainer: "#12344D",
    tertiary: "#8A4B22",
    tertiaryContainer: "#FFE1C7",
    surface: "#FBFCFD",
    surfaceVariant: "#E2E8ED",
    background: "#F5F7F9",
    outline: "#74808A",
    error: "#BA1A1A"
  }
};
