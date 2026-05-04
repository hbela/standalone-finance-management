jest.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaInsetsContext: require("react").createContext({ bottom: 0, left: 0, right: 0, top: 0 }),
  SafeAreaFrameContext: require("react").createContext({ height: 0, width: 0, x: 0, y: 0 }),
  useSafeAreaFrame: () => ({ height: 0, width: 0, x: 0, y: 0 }),
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 })
}));
