import { useRouter } from "expo-router";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Screen } from "../../components/Screen";
import { Button } from "../../components/Button";
import { ProgressBar } from "../../components/ProgressBar";
import { useOnboarding } from "../../context/OnboardingContext";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../constants/theme";

const DAYS = [1, 2, 3, 4, 5, 6, 7];

export default function DaysAvailableScreen() {
  const router = useRouter();
  const { data, update } = useOnboarding();

  return (
    <Screen style={styles.container}>
      <ProgressBar current={6} total={8} />
      <View style={styles.content}>
        <Text style={styles.title}>Training days per week</Text>
        <Text style={styles.subtitle}>
          How many days per week can you train?
        </Text>
        <View style={styles.daysRow}>
          {DAYS.map((day) => (
            <TouchableOpacity
              key={day}
              style={[styles.dayCell, data.days_available === day && styles.daySelected]}
              onPress={() => update({ days_available: day })}
            >
              <Text style={[styles.dayText, data.days_available === day && styles.dayTextSelected]}>
                {day}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={styles.buttons}>
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
        <Button
          title="Next"
          onPress={() => router.push("/onboarding/strongest")}
          disabled={!data.days_available}
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
  daysRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    justifyContent: "center",
  },
  dayCell: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.mediumGray,
    alignItems: "center",
    justifyContent: "center",
  },
  daySelected: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.darkGray,
  },
  dayText: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.white,
    fontWeight: "600",
  },
  dayTextSelected: {
    color: COLORS.primary,
  },
  buttons: {
    flexDirection: "row",
    gap: SPACING.md,
  },
});
