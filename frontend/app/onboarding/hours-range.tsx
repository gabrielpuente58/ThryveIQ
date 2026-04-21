import { useRouter } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Pressable,
  InputAccessoryView,
  TouchableOpacity,
} from "react-native";
import { Screen } from "../../components/Screen";
import { Button } from "../../components/Button";
import { ProgressBar } from "../../components/ProgressBar";
import { useOnboarding } from "../../context/OnboardingContext";
import { ThemeColors, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";

const INPUT_ACCESSORY_ID = "hours-range-done";

export default function HoursRangeScreen() {
  const router = useRouter();
  const { data, update } = useOnboarding();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const handleChange = (field: "hours_min" | "hours_max") => (text: string) => {
    const cleaned = text.replace(/[^0-9.]/g, "");
    const num = parseFloat(cleaned);
    update({ [field]: isNaN(num) ? undefined : num });
  };

  const minValue = data.hours_min;
  const maxValue = data.hours_max;
  const isValid =
    typeof minValue === "number" &&
    typeof maxValue === "number" &&
    minValue > 0 &&
    maxValue > 0 &&
    maxValue >= minValue;

  return (
    <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss}>
      <Screen style={styles.container}>
        <ProgressBar current={2} total={4} />
        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Text style={styles.title}>Weekly training hours</Text>
          <Text style={styles.subtitle}>
            What's the range of hours you can commit per week? We'll use the max as your target
            and the min for recovery weeks.
          </Text>
          <View style={styles.inputsRow}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Minimum</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 5"
                placeholderTextColor={colors.lightGray}
                keyboardType="decimal-pad"
                inputAccessoryViewID={Platform.OS === "ios" ? INPUT_ACCESSORY_ID : undefined}
                value={minValue !== undefined ? String(minValue) : ""}
                onChangeText={handleChange("hours_min")}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Maximum</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 10"
                placeholderTextColor={colors.lightGray}
                keyboardType="decimal-pad"
                inputAccessoryViewID={Platform.OS === "ios" ? INPUT_ACCESSORY_ID : undefined}
                value={maxValue !== undefined ? String(maxValue) : ""}
                onChangeText={handleChange("hours_max")}
              />
            </View>
          </View>
          <Text style={styles.unit}>hours / week</Text>
        </KeyboardAvoidingView>
        <View style={styles.buttons}>
          <Button title="Back" variant="secondary" onPress={() => router.back()} />
          <Button
            title="Next"
            onPress={() => router.push("/onboarding/days-available")}
            disabled={!isValid}
          />
        </View>
      </Screen>
      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={INPUT_ACCESSORY_ID}>
          <View style={styles.accessory}>
            <TouchableOpacity onPress={Keyboard.dismiss}>
              <Text style={styles.doneButton}>Done</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}
    </Pressable>
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
  inputsRow: {
    flexDirection: "row",
    gap: SPACING.md,
  },
  inputGroup: {
    flex: 1,
    gap: SPACING.xs,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    color: colors.lightGray,
    fontWeight: "600",
  },
  input: {
    backgroundColor: colors.mediumGray,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: FONT_SIZES.xl,
    color: colors.white,
    textAlign: "center",
  },
  unit: {
    fontSize: FONT_SIZES.md,
    color: colors.lightGray,
    textAlign: "center",
  },
  buttons: {
    flexDirection: "row",
    gap: SPACING.md,
  },
  accessory: {
    backgroundColor: colors.mediumGray,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    alignItems: "flex-end",
  },
  doneButton: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: colors.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
});
