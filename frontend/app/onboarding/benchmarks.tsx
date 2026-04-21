import { useState } from "react";
import { useRouter } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Pressable,
  InputAccessoryView,
  TouchableOpacity,
  Modal,
  ScrollView,
} from "react-native";
import { Screen } from "../../components/Screen";
import { Button } from "../../components/Button";
import { ProgressBar } from "../../components/ProgressBar";
import { PlanBuildingOverlay } from "../../components/PlanBuildingOverlay";
import { useOnboarding } from "../../context/OnboardingContext";
import { useAuth } from "../../context/AuthContext";
import { ThemeColors, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../constants/theme";
import { API_URL } from "../../constants/api";
import { useTheme } from "../../context/ThemeContext";

const INPUT_ACCESSORY_ID = "benchmarks-done";

type GuideKey = "ftp" | "lthr";

const TEST_GUIDES: Record<GuideKey, { title: string; body: string }> = {
  ftp: {
    title: "FTP Test (20-minute)",
    body:
      "The gold-standard FTP test is 20 minutes all-out on the bike.\n\n" +
      "1. Warm up 15–20 minutes easy, with 3×1min at race pace to open the legs.\n" +
      "2. Rest 5 minutes easy.\n" +
      "3. Perform a 20-minute time trial at the hardest sustainable effort you can hold.\n" +
      "4. Record your average power for the 20 minutes.\n" +
      "5. Your FTP ≈ 95% of that average.\n\n" +
      "Do it on a smart trainer or a flat, uninterrupted road. Hydrate, pre-fuel, and be well rested.",
  },
  lthr: {
    title: "Lactate Threshold HR Test (30-minute)",
    body:
      "The simplest field test for LTHR is a 30-minute solo run time trial.\n\n" +
      "1. Warm up 10–15 minutes with a few strides.\n" +
      "2. Run all-out for 30 minutes. Start conservative; you should finish hard but not blow up.\n" +
      "3. Hit the lap button at 10 minutes into the effort.\n" +
      "4. Your LTHR = your average HR for the final 20 minutes.\n\n" +
      "No racing, no drafting, no groups. Flat or rolling terrain is ideal.",
  },
};

export default function BenchmarksScreen() {
  const router = useRouter();
  const { data, update, testMode } = useOnboarding();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [loading, setLoading] = useState(false);
  const [activeGuide, setActiveGuide] = useState<GuideKey | null>(null);

  const handleIntChange = (field: "ftp" | "lthr") => (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, "");
    const num = parseInt(cleaned, 10);
    update({ [field]: isNaN(num) ? undefined : num });
  };

  const handleSubmit = async () => {
    if (testMode) {
      router.replace("/(tabs)/plan");
      return;
    }
    if (!user) return;

    setLoading(true);
    try {
      const payload = {
        user_id: user.id,
        goal: "recreational",
        race_date: data.race_date,
        experience: "recreational",
        hours_min: data.hours_min,
        hours_max: data.hours_max,
        days_available: data.days_available,
        strongest_discipline: "bike",
        weakest_discipline: "run",
        focus_discipline: "run",
        ftp: data.ftp ?? 0,
        lthr: data.lthr ?? 0,
        css: "",
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

      const planRes = await fetch(`${API_URL}/plans/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id }),
      });

      if (!planRes.ok) throw new Error("Failed to start plan generation");

      const { job_id } = await planRes.json();

      await new Promise<void>((resolve, reject) => {
        const poll = setInterval(async () => {
          try {
            const jobRes = await fetch(`${API_URL}/plans/job/${job_id}`);
            const job = await jobRes.json();
            if (job.status === "done") {
              clearInterval(poll);
              resolve();
            } else if (job.status === "error") {
              clearInterval(poll);
              reject(new Error(job.error ?? "Plan generation failed"));
            }
          } catch (e) {
            clearInterval(poll);
            reject(e);
          }
        }, 5000);
      });

      router.replace("/(tabs)/plan");
    } catch (err) {
      Alert.alert("Error", "Failed to save profile or generate plan. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const renderField = (
    key: GuideKey,
    label: string,
    placeholder: string,
    value: string,
    onChange: (text: string) => void,
    keyboardType: "decimal-pad" | "default",
  ) => (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.lightGray}
        keyboardType={keyboardType}
        inputAccessoryViewID={Platform.OS === "ios" ? INPUT_ACCESSORY_ID : undefined}
        value={value}
        onChangeText={onChange}
      />
      <TouchableOpacity onPress={() => setActiveGuide(key)}>
        <Text style={styles.helpLink}>How do I test this?</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss}>
      <PlanBuildingOverlay visible={loading} />
      <Screen style={styles.container}>
        <ProgressBar current={4} total={4} />
        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>Fitness benchmarks (optional)</Text>
            <Text style={styles.subtitle}>
              Enter any test results you have. We'll use these for precise zone targets. Skip any
              you haven't tested — we'll use effort-based zones instead.
            </Text>
            {renderField(
              "ftp",
              "FTP (watts)",
              "e.g. 220",
              data.ftp !== undefined ? String(data.ftp) : "",
              handleIntChange("ftp"),
              "decimal-pad",
            )}
            {renderField(
              "lthr",
              "LTHR (bpm)",
              "e.g. 165",
              data.lthr !== undefined ? String(data.lthr) : "",
              handleIntChange("lthr"),
              "decimal-pad",
            )}
          </ScrollView>
        </KeyboardAvoidingView>
        <View style={styles.buttons}>
          <Button title="Back" variant="secondary" onPress={() => router.back()} />
          <Button
            title={loading ? "Building plan…" : "Finish"}
            onPress={handleSubmit}
            disabled={loading}
            loading={loading}
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
      <Modal
        visible={activeGuide !== null}
        animationType="slide"
        onRequestClose={() => setActiveGuide(null)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {activeGuide ? TEST_GUIDES[activeGuide].title : ""}
            </Text>
            <TouchableOpacity onPress={() => setActiveGuide(null)} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.modalText}>
              {activeGuide ? TEST_GUIDES[activeGuide].body : ""}
            </Text>
          </ScrollView>
        </View>
      </Modal>
    </Pressable>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    justifyContent: "space-between",
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    gap: SPACING.lg,
    paddingVertical: SPACING.md,
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
  fieldGroup: {
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
    fontSize: FONT_SIZES.lg,
    color: colors.white,
  },
  helpLink: {
    fontSize: FONT_SIZES.sm,
    color: colors.primary,
    fontWeight: "600",
    marginTop: SPACING.xs,
  },
  buttons: {
    flexDirection: "row",
    gap: SPACING.md,
    paddingTop: SPACING.md,
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
  modalContainer: {
    flex: 1,
    padding: SPACING.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  modalTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "bold",
    color: colors.white,
    flex: 1,
    paddingRight: SPACING.md,
  },
  closeButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  closeText: {
    fontSize: FONT_SIZES.md,
    color: colors.primary,
    fontWeight: "600",
  },
  modalBody: {
    paddingBottom: SPACING.xl,
  },
  modalText: {
    fontSize: FONT_SIZES.md,
    color: colors.white,
    lineHeight: 24,
  },
});
