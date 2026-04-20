import React, { createContext, useContext, useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { darkColors, lightColors, ThemeColors } from "../constants/theme";

const STORAGE_KEY = "@thryveiq/theme";

interface ThemeContextValue {
  colors: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: darkColors,
  isDark: true,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [override, setOverride] = useState<"dark" | "light" | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val === "dark" || val === "light") setOverride(val);
      setReady(true);
    });
  }, []);

  const isDark = override ? override === "dark" : systemScheme !== "light";

  const toggleTheme = () => {
    const next = isDark ? "light" : "dark";
    setOverride(next);
    AsyncStorage.setItem(STORAGE_KEY, next);
  };

  if (!ready) return null;

  return (
    <ThemeContext.Provider value={{ colors: isDark ? darkColors : lightColors, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
