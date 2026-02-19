import { useState } from "react";
import { useRouter } from "expo-router";
import { View, Text, StyleSheet, Platform, TouchableOpacity } from "react-native";
import { Screen } from "../../components/Screen";
import { Button } from "../../components/Button";
import { ProgressBar } from "../../components/ProgressBar";
import { useOnboarding } from "../../context/OnboardingContext";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../constants/theme";

export default function RaceDateScreen() {
  const router = useRouter();
  const { data, update } = useOnboarding();
  const [year, setYear] = useState(data.race_date ? new Date(data.race_date).getFullYear() : 2026);
  const [month, setMonth] = useState(data.race_date ? new Date(data.race_date).getMonth() : new Date().getMonth());

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const selectDate = (m: number, y: number) => {
    setMonth(m);
    setYear(y);
    const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-15`;
    update({ race_date: dateStr });
  };

  return (
    <Screen style={styles.container}>
      <ProgressBar current={2} total={8} />
      <View style={styles.content}>
        <Text style={styles.title}>When is your race?</Text>
        <Text style={styles.subtitle}>Select the month and year of your target race.</Text>

        <View style={styles.yearRow}>
          <TouchableOpacity onPress={() => setYear((y) => y - 1)}>
            <Text style={styles.yearArrow}>{"<"}</Text>
          </TouchableOpacity>
          <Text style={styles.yearText}>{year}</Text>
          <TouchableOpacity onPress={() => setYear((y) => y + 1)}>
            <Text style={styles.yearArrow}>{">"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.monthGrid}>
          {months.map((name, i) => (
            <TouchableOpacity
              key={name}
              style={[
                styles.monthCell,
                month === i && year === (data.race_date ? new Date(data.race_date).getFullYear() : -1) && styles.monthSelected,
              ]}
              onPress={() => selectDate(i, year)}
            >
              <Text
                style={[
                  styles.monthText,
                  month === i && year === (data.race_date ? new Date(data.race_date).getFullYear() : -1) && styles.monthTextSelected,
                ]}
              >
                {name.slice(0, 3)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
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
  yearRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xl,
  },
  yearText: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "bold",
    color: COLORS.white,
  },
  yearArrow: {
    fontSize: FONT_SIZES.xl,
    color: COLORS.primary,
    fontWeight: "bold",
    paddingHorizontal: SPACING.md,
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    justifyContent: "center",
  },
  monthCell: {
    width: "30%",
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.mediumGray,
    alignItems: "center",
  },
  monthSelected: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.darkGray,
  },
  monthText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.white,
    fontWeight: "500",
  },
  monthTextSelected: {
    color: COLORS.primary,
  },
  buttons: {
    flexDirection: "row",
    gap: SPACING.md,
  },
});
