import { useEffect } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { View, Text, StyleSheet } from "react-native";
import { Screen } from "../../components/Screen";
import { Button } from "../../components/Button";
import { ProgressBar } from "../../components/ProgressBar";
import { OptionCard } from "../../components/OptionCard";
import { useOnboarding } from "../../context/OnboardingContext";
import { COLORS, SPACING, FONT_SIZES } from "../../constants/theme";

const OPTIONS = [
  { value: "first_timer" as const, label: "First Timer", description: "This is my first Ironman 70.3" },
  { value: "recreational" as const, label: "Recreational", description: "I want to finish and have fun" },
  { value: "competitive" as const, label: "Competitive", description: "I'm racing for a specific time goal" },
];

export default function GoalScreen() {
  const router = useRouter();
  const { test } = useLocalSearchParams<{ test?: string }>();
  const { data, update, setTestMode } = useOnboarding();

  useEffect(() => {
    if (test === "true") setTestMode(true);
  }, []);

  return (
    <Screen style={styles.container}>
      <ProgressBar current={1} total={8} />
      <View style={styles.content}>
        <Text style={styles.title}>What's your race goal?</Text>
        <Text style={styles.subtitle}>This helps us tailor your training plan intensity.</Text>
        <View style={styles.options}>
          {OPTIONS.map((opt) => (
            <OptionCard
              key={opt.value}
              label={opt.label}
              description={opt.description}
              selected={data.goal === opt.value}
              onPress={() => update({ goal: opt.value })}
            />
          ))}
        </View>
      </View>
      <Button
        title="Next"
        onPress={() => router.push("/onboarding/race-date")}
        disabled={!data.goal}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "space-between",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    gap: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: "bold",
    color: COLORS.white,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.lightGray,
    lineHeight: 22,
  },
  options: {
    gap: SPACING.md,
  },
});
