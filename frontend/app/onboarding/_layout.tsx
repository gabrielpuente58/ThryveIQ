import { Stack, useRouter } from "expo-router";
import { TouchableOpacity, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { OnboardingProvider, useOnboarding } from "../../context/OnboardingContext";
import { COLORS, SPACING } from "../../constants/theme";

function OnboardingStack() {
  const { testMode } = useOnboarding();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {testMode && (
        <TouchableOpacity
          style={[styles.exitButton, { top: insets.top + SPACING.sm }]}
          onPress={() => router.replace("/(tabs)/plan")}
        >
          <Ionicons name="close" size={22} color={COLORS.white} />
        </TouchableOpacity>
      )}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#131321" },
          animation: "slide_from_right",
        }}
      />
    </View>
  );
}

export default function OnboardingLayout() {
  return (
    <OnboardingProvider>
      <OnboardingStack />
    </OnboardingProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#131321",
  },
  exitButton: {
    position: "absolute",
    right: SPACING.md,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.mediumGray,
    alignItems: "center",
    justifyContent: "center",
  },
});
