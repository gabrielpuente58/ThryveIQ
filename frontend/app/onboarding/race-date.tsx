import { useState } from "react";
import { useRouter } from "expo-router";
import { View, Text, StyleSheet, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Screen } from "../../components/Screen";
import { Button } from "../../components/Button";
import { ProgressBar } from "../../components/ProgressBar";
import { useOnboarding } from "../../context/OnboardingContext";
import { COLORS, SPACING, FONT_SIZES } from "../../constants/theme";

const MIN_DATE = new Date();
MIN_DATE.setMonth(MIN_DATE.getMonth() + 1);

export default function RaceDateScreen() {
  const router = useRouter();
  const { data, update } = useOnboarding();

  const initialDate = data.race_date ? new Date(data.race_date) : MIN_DATE;
  const [date, setDate] = useState(initialDate);

  const handleChange = (_: unknown, selected?: Date) => {
    if (!selected) return;
    setDate(selected);
    update({ race_date: selected.toISOString().split("T")[0] });
  };

  return (
    <Screen style={styles.container}>
      <ProgressBar current={2} total={8} />
      <View style={styles.content}>
        <Text style={styles.title}>When is your race?</Text>
        <Text style={styles.subtitle}>Pick the exact date of your target event.</Text>

        <DateTimePicker
          value={date}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          minimumDate={MIN_DATE}
          onChange={handleChange}
          themeVariant="dark"
          accentColor={COLORS.primary}
          style={styles.picker}
        />
      </View>
      <View style={styles.buttons}>
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
        <Button
          title="Next"
          onPress={() => router.push("/onboarding/experience")}
          disabled={!data.race_date}
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
  picker: {
    alignSelf: "stretch",
  },
  buttons: {
    flexDirection: "row",
    gap: SPACING.md,
  },
});
