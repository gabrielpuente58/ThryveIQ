import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Button } from "./Button";
import { useTheme } from "../context/ThemeContext";
import { ThemeColors, SPACING, FONT_SIZES, BORDER_RADIUS } from "../constants/theme";

export interface WeekFeedback {
  rpe: number | null;
  went_well: string;
  didnt_go_well: string;
  notes: string;
}

interface Props {
  visible: boolean;
  weekIndex: number;
  onSubmit: (feedback: WeekFeedback) => void | Promise<void>;
  onClose: () => void;
  submitting?: boolean;
}

export const FeedbackModal: React.FC<Props> = ({ visible, weekIndex, onSubmit, onClose, submitting }) => {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [rpe, setRpe] = useState<number | null>(null);
  const [wentWell, setWentWell] = useState("");
  const [didntGoWell, setDidntGoWell] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setRpe(null);
    setWentWell("");
    setDidntGoWell("");
    setNotes("");
  };

  const handleSubmit = async () => {
    await onSubmit({ rpe, went_well: wentWell, didnt_go_well: didntGoWell, notes });
    reset();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <Text style={styles.title}>Week {weekIndex} check-in</Text>
              <TouchableOpacity onPress={handleClose}>
                <Text style={styles.closeText}>Skip</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.subtitle}>
              Quick reflection before we build next week. This shapes the coach's approach.
            </Text>

            <Text style={styles.label}>Average effort (RPE 1–10)</Text>
            <View style={styles.rpeRow}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[
                    styles.rpeChip,
                    rpe === n && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => setRpe(n)}
                >
                  <Text style={[styles.rpeText, rpe === n && { color: colors.background }]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>What went well?</Text>
            <TextInput
              style={styles.textarea}
              multiline
              placeholder="e.g. long ride felt strong, nailed the tempo run"
              placeholderTextColor={colors.lightGray}
              value={wentWell}
              onChangeText={setWentWell}
            />

            <Text style={styles.label}>What didn't go well?</Text>
            <TextInput
              style={styles.textarea}
              multiline
              placeholder="e.g. skipped the swim, calves tight on Sunday"
              placeholderTextColor={colors.lightGray}
              value={didntGoWell}
              onChangeText={setDidntGoWell}
            />

            <Text style={styles.label}>Other notes</Text>
            <TextInput
              style={styles.textarea}
              multiline
              placeholder="Anything else the coach should know"
              placeholderTextColor={colors.lightGray}
              value={notes}
              onChangeText={setNotes}
            />
          </ScrollView>

          <View style={styles.buttons}>
            <Button title="Cancel" variant="secondary" onPress={handleClose} />
            <Button
              title={submitting ? "Building…" : "Build next week"}
              onPress={handleSubmit}
              loading={submitting}
              disabled={submitting}
            />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, padding: SPACING.lg },
    scroll: { gap: SPACING.md, paddingTop: SPACING.xl, paddingBottom: SPACING.lg },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    title: { fontSize: FONT_SIZES.xxl, fontWeight: "bold", color: colors.white },
    subtitle: { fontSize: FONT_SIZES.sm, color: colors.lightGray, marginBottom: SPACING.md },
    closeText: { fontSize: FONT_SIZES.md, color: colors.primary, fontWeight: "600" },
    label: { fontSize: FONT_SIZES.sm, fontWeight: "700", color: colors.white, marginTop: SPACING.sm },
    rpeRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs },
    rpeChip: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.darkGray,
      alignItems: "center",
      justifyContent: "center",
    },
    rpeText: { fontSize: FONT_SIZES.sm, color: colors.white, fontWeight: "600" },
    textarea: {
      backgroundColor: colors.mediumGray,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.md,
      fontSize: FONT_SIZES.md,
      color: colors.white,
      minHeight: 60,
      textAlignVertical: "top",
    },
    buttons: { flexDirection: "row", gap: SPACING.md, paddingTop: SPACING.md },
  });
