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
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../constants/theme";

const INPUT_ACCESSORY_ID = "weekly-hours-done";

export default function WeeklyHoursScreen() {
  const router = useRouter();
  const { data, update } = useOnboarding();

  const handleChange = (text: string) => {
    const cleaned = text.replace(/[^0-9.]/g, "");
    const num = parseFloat(cleaned);
    update({ weekly_hours: isNaN(num) ? undefined : num });
  };

  return (
    <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss}>
      <Screen style={styles.container}>
        <ProgressBar current={5} total={8} />
        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Text style={styles.title}>Weekly training hours</Text>
          <Text style={styles.subtitle}>
            How many hours per week can you dedicate to training?
          </Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="e.g. 8"
              placeholderTextColor={COLORS.lightGray}
              keyboardType="decimal-pad"
              inputAccessoryViewID={Platform.OS === "ios" ? INPUT_ACCESSORY_ID : undefined}
              value={data.weekly_hours !== undefined ? String(data.weekly_hours) : ""}
              onChangeText={handleChange}
            />
            <Text style={styles.unit}>hours / week</Text>
          </View>
        </KeyboardAvoidingView>
        <View style={styles.buttons}>
          <Button title="Back" variant="secondary" onPress={() => router.back()} />
          <Button
            title="Next"
            onPress={() => router.push("/onboarding/days-available")}
            disabled={!data.weekly_hours || data.weekly_hours <= 0}
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
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  input: {
    backgroundColor: COLORS.mediumGray,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: FONT_SIZES.xl,
    color: COLORS.white,
    minWidth: 100,
    textAlign: "center",
  },
  unit: {
    fontSize: FONT_SIZES.md,
    color: COLORS.lightGray,
  },
  buttons: {
    flexDirection: "row",
    gap: SPACING.md,
  },
  accessory: {
    backgroundColor: COLORS.mediumGray,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    alignItems: "flex-end",
  },
  doneButton: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
});
