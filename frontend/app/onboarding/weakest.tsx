import { useState } from "react";
import { useRouter } from "expo-router";
import { View, Text, StyleSheet, Alert } from "react-native";
import { Screen } from "../../components/Screen";
import { Button } from "../../components/Button";
import { ProgressBar } from "../../components/ProgressBar";
import { OptionCard } from "../../components/OptionCard";
import { useOnboarding } from "../../context/OnboardingContext";
import { COLORS, SPACING, FONT_SIZES } from "../../constants/theme";
import Constants from "expo-constants";

const API_URL = __DEV__
  ? `http://${Constants.expoConfig?.hostUri?.split(":")[0] ?? "localhost"}:8000`
  : "http://localhost:8000";

const OPTIONS = [
  { value: "swim" as const, label: "Swim", description: "Swimming is my weakest discipline" },
  { value: "bike" as const, label: "Bike", description: "Cycling is my weakest discipline" },
  { value: "run" as const, label: "Run", description: "Running is my weakest discipline" },
];

export default function WeakestScreen() {
  const router = useRouter();
  const { data, update } = useOnboarding();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const payload = {
        ...data,
        user_id: "00000000-0000-0000-0000-000000000001",
      };

      const res = await fetch(`${API_URL}/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }

      router.replace("/chat");
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
