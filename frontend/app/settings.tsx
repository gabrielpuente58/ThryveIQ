import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Screen } from "../components/Screen";
import { Card } from "../components/Card";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { API_URL } from "../constants/api";
import { ThemeColors, SPACING, FONT_SIZES, BORDER_RADIUS } from "../constants/theme";

interface Profile {
  goal: string;
  race_date: string;
  experience: string;
  weekly_hours: number;
  days_available: number;
  strongest_discipline: string;
  weakest_discipline: string;
}

interface EditDraft {
  goal: string;
  experience: string;
  weekly_hours: string;
  days_available: string;
  strongest_discipline: string;
  weakest_discipline: string;
  race_date: string;
}

const LABELS: Record<string, string> = {
  first_timer: "First Timer",
  recreational: "Recreational",
  competitive: "Competitive",
  swim: "Swim",
  bike: "Bike",
  run: "Run",
};

const GOAL_OPTIONS = ["first_timer", "recreational", "competitive"] as const;
const DISCIPLINE_OPTIONS = ["swim", "bike", "run"] as const;

const MIN_RACE_DATE = new Date();
MIN_RACE_DATE.setMonth(MIN_RACE_DATE.getMonth() + 1);

function profileToDraft(p: Profile): EditDraft {
  return {
    goal: p.goal,
    experience: p.experience,
    weekly_hours: String(p.weekly_hours),
    days_available: String(p.days_available),
    strongest_discipline: p.strongest_discipline,
    weakest_discipline: p.weakest_discipline,
    race_date: p.race_date,
  };
}

export default function SettingsScreen() {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    fetch(`${API_URL}/profiles/${user.id}`)
      .then((res) => res.json())
      .then((data: Profile) => {
        setProfile(data);
        setDraft(profileToDraft(data));
      })
      .catch(() => Alert.alert("Error", "Could not load profile."))
      .finally(() => setLoading(false));
  }, [user]);

  const handleSave = async () => {
    if (!user || !draft || !profile) return;
    setSaving(true);
    try {
      const payload: Record<string, string | number> = {};

      if (draft.goal !== profile.goal) payload.goal = draft.goal;
      if (draft.experience !== profile.experience) payload.experience = draft.experience;
      if (draft.strongest_discipline !== profile.strongest_discipline)
        payload.strongest_discipline = draft.strongest_discipline;
      if (draft.weakest_discipline !== profile.weakest_discipline)
        payload.weakest_discipline = draft.weakest_discipline;
      if (draft.race_date !== profile.race_date) payload.race_date = draft.race_date;

      const parsedHours = parseFloat(draft.weekly_hours);
      if (!isNaN(parsedHours) && parsedHours !== profile.weekly_hours)
        payload.weekly_hours = parsedHours;

      const parsedDays = parseInt(draft.days_available, 10);
      if (!isNaN(parsedDays) && parsedDays !== profile.days_available)
        payload.days_available = parsedDays;

      const res = await fetch(`${API_URL}/profiles/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Save failed");

      router.back();
    } catch {
      Alert.alert("Error", "Could not save changes.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !draft) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </Screen>
    );
  }

  const draftDate = draft.race_date ? new Date(draft.race_date) : MIN_RACE_DATE;

  return (
    <Screen>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Training</Text>

          <EditFieldRow label="Weekly Hours" colors={colors}>
            <TextInput
              style={styles.textInput}
              value={draft.weekly_hours}
              onChangeText={(v) => setDraft({ ...draft, weekly_hours: v })}
              keyboardType="numeric"
              placeholderTextColor={colors.lightGray}
            />
          </EditFieldRow>

          <EditFieldRow label="Days / Week" colors={colors}>
            <TextInput
              style={styles.textInput}
              value={draft.days_available}
              onChangeText={(v) => setDraft({ ...draft, days_available: v })}
              keyboardType="numeric"
              placeholderTextColor={colors.lightGray}
            />
          </EditFieldRow>

          <EditFieldRow label="Goal" colors={colors}>
            <View style={styles.pillRow}>
              {GOAL_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.pill, draft.goal === opt && styles.pillActive]}
                  onPress={() => setDraft({ ...draft, goal: opt })}
                >
                  <Text style={[styles.pillText, draft.goal === opt && styles.pillTextActive]}>
                    {LABELS[opt]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </EditFieldRow>

          <EditFieldRow label="Experience" colors={colors}>
            <View style={styles.pillRow}>
              {GOAL_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.pill, draft.experience === opt && styles.pillActive]}
                  onPress={() => setDraft({ ...draft, experience: opt })}
                >
                  <Text style={[styles.pillText, draft.experience === opt && styles.pillTextActive]}>
                    {LABELS[opt]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </EditFieldRow>
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Disciplines</Text>

          <EditFieldRow label="Strongest" colors={colors}>
            <View style={styles.pillRow}>
              {DISCIPLINE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.pill, draft.strongest_discipline === opt && styles.pillActive]}
                  onPress={() => setDraft({ ...draft, strongest_discipline: opt })}
                >
                  <Text
                    style={[
                      styles.pillText,
                      draft.strongest_discipline === opt && styles.pillTextActive,
                    ]}
                  >
                    {LABELS[opt]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </EditFieldRow>

          <EditFieldRow label="Focus (Weakest)" colors={colors}>
            <View style={styles.pillRow}>
              {DISCIPLINE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.pill, draft.weakest_discipline === opt && styles.pillActive]}
                  onPress={() => setDraft({ ...draft, weakest_discipline: opt })}
                >
                  <Text
                    style={[
                      styles.pillText,
                      draft.weakest_discipline === opt && styles.pillTextActive,
                    ]}
                  >
                    {LABELS[opt]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </EditFieldRow>
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Race Date</Text>
          <DateTimePicker
            value={draftDate}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            minimumDate={MIN_RACE_DATE}
            onChange={(_, selected) => {
              if (!selected) return;
              setDraft({ ...draft, race_date: selected.toISOString().split("T")[0] });
            }}
            themeVariant={isDark ? "dark" : "light"}
            accentColor={colors.primary}
            style={styles.datePicker}
          />
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => router.back()}
          disabled={saving}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

function EditFieldRow({
  label,
  children,
  colors,
}: {
  label: string;
  children: React.ReactNode;
  colors: ThemeColors;
}) {
  return (
    <View style={{ gap: SPACING.xs }}>
      <Text style={{ fontSize: FONT_SIZES.xs, color: colors.lightGray }}>{label}</Text>
      {children}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    centered: { justifyContent: "center", alignItems: "center" },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: SPACING.md,
    },
    backButton: {
      width: 32,
      height: 32,
      alignItems: "flex-start",
      justifyContent: "center",
    },
    title: {
      fontSize: FONT_SIZES.xl,
      fontWeight: "700",
      color: colors.white,
    },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: SPACING.md },
    section: { marginBottom: SPACING.md, gap: SPACING.md },
    sectionTitle: {
      fontSize: FONT_SIZES.xs,
      fontWeight: "700",
      color: colors.lightGray,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    textInput: {
      backgroundColor: colors.darkGray,
      borderRadius: BORDER_RADIUS.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      fontSize: FONT_SIZES.md,
      color: colors.white,
    },
    pillRow: { flexDirection: "row", gap: SPACING.sm, flexWrap: "wrap" },
    pill: {
      backgroundColor: colors.darkGray,
      paddingVertical: SPACING.xs,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.xl,
    },
    pillActive: { backgroundColor: colors.primary },
    pillText: { fontSize: FONT_SIZES.sm, color: colors.lightGray, fontWeight: "500" },
    pillTextActive: { color: colors.background, fontWeight: "700" },
    datePicker: { alignSelf: "stretch" },
    footer: {
      flexDirection: "row",
      gap: SPACING.md,
      paddingTop: SPACING.md,
      borderTopWidth: 1,
      borderTopColor: colors.mediumGray,
    },
    cancelButton: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.lightGray + "60",
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.md,
      alignItems: "center",
    },
    cancelButtonText: {
      fontSize: FONT_SIZES.md,
      color: colors.lightGray,
      fontWeight: "600",
    },
    saveButton: {
      flex: 1,
      backgroundColor: colors.primary,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.md,
      alignItems: "center",
    },
    saveButtonDisabled: { opacity: 0.6 },
    saveButtonText: {
      fontSize: FONT_SIZES.md,
      fontWeight: "700",
      color: colors.background,
    },
  });
