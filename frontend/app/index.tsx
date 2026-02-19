import { useRouter } from "expo-router";
import { Screen } from "../components/Screen";
import { Button } from "../components/Button";
import { Text, View, StyleSheet } from "react-native";
import { COLORS, SPACING, FONT_SIZES } from "../constants/theme";

export default function Index() {
  const router = useRouter();

  return (
    <Screen style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>ThryveIQ</Text>
        <Text style={styles.subtitle}>Your AI Triathlon Coach</Text>
        <Text style={styles.description}>
          Get personalized training plans, nutrition advice, and expert guidance
          powered by artificial intelligence.
        </Text>
        <Button title="Start Coaching" onPress={() => router.push("/onboarding/goal")} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
  },
  content: {
    alignItems: "center",
    gap: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.xxl + 8,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZES.xl,
    color: COLORS.white,
    fontWeight: "600",
    marginBottom: SPACING.md,
  },
  description: {
    fontSize: FONT_SIZES.md,
    color: COLORS.lightGray,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
});
