import { useRouter } from "expo-router";
import { View, Text, StyleSheet } from "react-native";
import { Screen } from "../../components/Screen";
import { Button } from "../../components/Button";
import { ProgressBar } from "../../components/ProgressBar";
import { OptionCard } from "../../components/OptionCard";
import { useOnboarding } from "../../context/OnboardingContext";
import { COLORS, SPACING, FONT_SIZES } from "../../constants/theme";

const OPTIONS = [
  { value: "first_timer" as const, label: "First Timer", description: "I've never done a triathlon before" },
  { value: "recreational" as const, label: "Recreational", description: "I've done a few races casually" },
  { value: "competitive" as const, label: "Competitive", description: "I race regularly and train seriously" },
];

export default function ExperienceScreen() {
  const router = useRouter();
  const { data, update } = useOnboarding();

  return (
    <Screen style={styles.container}>
      <ProgressBar current={3} total={8} />
      <View style={styles.content}>
        <Text style={styles.title}>Triathlon experience?</Text>
        <Text style={styles.subtitle}>How much triathlon experience do you have?</Text>
        <View style={styles.options}>
          {OPTIONS.map((opt) => (
            <OptionCard
              key={opt.value}
              label={opt.label}
              description={opt.description}
              selected={data.experience === opt.value}
              onPress={() => update({ experience: opt.value })}
            />
          ))}
        </View>
      </View>
      <View style={styles.buttons}>
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
        <Button
          title="Next"
          onPress={() => router.push("/onboarding/background")}
          disabled={!data.experience}
        />
      </View>
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
  buttons: {
    flexDirection: "row",
    gap: SPACING.md,
  },
});
