import { useRouter } from "expo-router";
import { View, Text, StyleSheet, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { Screen } from "../../components/Screen";
import { Button } from "../../components/Button";
import { ProgressBar } from "../../components/ProgressBar";
import { useOnboarding } from "../../context/OnboardingContext";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../constants/theme";

export default function BackgroundScreen() {
  const router = useRouter();
  const { data, update } = useOnboarding();

  return (
    <Screen style={styles.container}>
      <ProgressBar current={4} total={8} />
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Text style={styles.title}>Fitness background</Text>
        <Text style={styles.subtitle}>
          Tell us about your current fitness level and any sports background.
        </Text>
        <TextInput
          style={styles.textArea}
          placeholder="e.g. I run 3x a week, swam in college, new to cycling..."
          placeholderTextColor={COLORS.lightGray}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          value={data.current_background ?? ""}
          onChangeText={(text) => update({ current_background: text })}
        />
      </KeyboardAvoidingView>
      <View style={styles.buttons}>
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
        <Button
          title="Next"
          onPress={() => router.push("/onboarding/weekly-hours")}
          disabled={!data.current_background?.trim()}
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
  textArea: {
    backgroundColor: COLORS.mediumGray,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.white,
    minHeight: 120,
  },
  buttons: {
    flexDirection: "row",
    gap: SPACING.md,
  },
});
