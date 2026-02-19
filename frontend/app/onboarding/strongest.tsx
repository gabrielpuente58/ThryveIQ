import { useRouter } from "expo-router";
import { View, Text, StyleSheet } from "react-native";
import { Screen } from "../../components/Screen";
import { Button } from "../../components/Button";
import { ProgressBar } from "../../components/ProgressBar";
import { OptionCard } from "../../components/OptionCard";
import { useOnboarding } from "../../context/OnboardingContext";
import { COLORS, SPACING, FONT_SIZES } from "../../constants/theme";

const OPTIONS = [
  { value: "swim" as const, label: "Swim", description: "Swimming is my strongest discipline" },
  { value: "bike" as const, label: "Bike", description: "Cycling is my strongest discipline" },
  { value: "run" as const, label: "Run", description: "Running is my strongest discipline" },
];

export default function StrongestScreen() {
  const router = useRouter();
  const { data, update } = useOnboarding();

  return (
    <Screen style={styles.container}>
      <ProgressBar current={7} total={8} />
      <View style={styles.content}>
        <Text style={styles.title}>Strongest discipline</Text>
        <Text style={styles.subtitle}>Which discipline do you feel most confident in?</Text>
        <View style={styles.options}>
          {OPTIONS.map((opt) => (
            <OptionCard
              key={opt.value}
              label={opt.label}
              description={opt.description}
              selected={data.strongest_discipline === opt.value}
              onPress={() => update({ strongest_discipline: opt.value })}
            />
          ))}
        </View>
      </View>
      <View style={styles.buttons}>
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
        <Button
          title="Next"
          onPress={() => router.push("/onboarding/weakest")}
          disabled={!data.strongest_discipline}
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
