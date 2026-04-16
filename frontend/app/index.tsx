import { ActivityIndicator, View, StyleSheet } from "react-native";
import { ThemeColors } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";

// Intentionally blank — RouteGuard in _layout.tsx handles all navigation.
export default function Index() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
});
