import { useState } from "react";
import { useRouter } from "expo-router";
import { View, Text, StyleSheet, Alert } from "react-native";
import { Screen } from "../../components/Screen";
import { Button } from "../../components/Button";
import { ProgressBar } from "../../components/ProgressBar";
import { OptionCard } from "../../components/OptionCard";
import { useOnboarding } from "../../context/OnboardingContext";
import { useAuth } from "../../context/AuthContext";
import { ThemeColors, SPACING, FONT_SIZES } from "../../constants/theme";
import { API_URL } from "../../constants/api";
import { useTheme } from "../../context/ThemeContext";

const OPTIONS = [
  { value: "swim" as const, label: "Swim", description: "Swimming is my weakest discipline" },
  { value: "bike" as const, label: "Bike", description: "Cycling is my weakest discipline" },
  { value: "run" as const, label: "Run", description: "Running is my weakest discipline" },
];

export default function WeakestScreen() {
  const router = useRouter();
  const { data, update, testMode } = useOnboarding();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (testMode) {
      router.replace("/(tabs)/plan");
      return;
    }
    if (!user) return;
    setLoading(true);
    try {
      const payload = { ...data, user_id: user.id };

      const res = await fetch(`${API_URL}/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }

      const planRes = await fetch(`${API_URL}/plans/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id }),
      });

      if (!planRes.ok) {
        throw new Error("Failed to generate plan");
      }

      router.replace("/(tabs)/plan");
    } catch (err) {
      Alert.alert("Error", "Failed to save profile. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen style={styles.container}>
      <ProgressBar current={8} total={8} />
      <View style={styles.content}>
        <Text style={styles.title}>Weakest discipline</Text>
        <Text style={styles.subtitle}>Which discipline needs the most work?</Text>
        <View style={styles.options}>
          {OPTIONS.map((opt) => (
            <OptionCard
              key={opt.value}
              label={opt.label}
              description={opt.description}
              selected={data.weakest_discipline === opt.value}
              onPress={() => update({ weakest_discipline: opt.value })}
            />
          ))}
        </View>
      </View>
      <View style={styles.buttons}>
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
        <Button
          title="Finish"
          onPress={handleSubmit}
          disabled={!data.weakest_discipline}
          loading={loading}
        />
      </View>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
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
    color: colors.white,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: colors.lightGray,
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
