import { useRouter } from "expo-router";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Screen } from "../../components/Screen";
import { Button } from "../../components/Button";
import { ProgressBar } from "../../components/ProgressBar";
import { useOnboarding } from "../../context/OnboardingContext";
import { ThemeColors, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";

const DAYS = [1, 2, 3, 4, 5, 6, 7];

export default function DaysAvailableScreen() {
  const router = useRouter();
  const { data, update } = useOnboarding();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <Screen style={styles.container}>
      <ProgressBar current={3} total={4} />
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
          onPress={() => router.push("/onboarding/benchmarks")}
          disabled={!data.days_available}
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
  daysRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    justifyContent: "center",
  },
  dayCell: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: colors.mediumGray,
    alignItems: "center",
    justifyContent: "center",
  },
  daySelected: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.darkGray,
  },
  dayText: {
    fontSize: FONT_SIZES.lg,
    color: colors.white,
    fontWeight: "600",
  },
  dayTextSelected: {
    color: colors.primary,
  },
  buttons: {
    flexDirection: "row",
    gap: SPACING.md,
  },
});
