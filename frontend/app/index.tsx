import { ActivityIndicator, View, StyleSheet } from "react-native";
import { COLORS } from "../constants/theme";

// Intentionally blank — RouteGuard in _layout.tsx handles all navigation.
export default function Index() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },
});
