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
  Dimensions,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { supabase } from "../../lib/supabase";
import { API_URL } from "../../constants/api";
import { ThemeColors, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../constants/theme";

const STRAVA_CLIENT_ID = process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID;
const STRAVA_REDIRECT_URI = "thryveiq://localhost/strava-callback";
const STRAVA_SCOPE = "activity:read_all";

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

const SPORT_COLORS_PROFILE: Record<string, string> = {
  swim: "#3B82F6",
  bike: "#22C55E",
  run: "#F97316",
};

const GOAL_OPTIONS = ["first_timer", "recreational", "competitive"] as const;
const DISCIPLINE_OPTIONS = ["swim", "bike", "run"] as const;

// ── Progress / chart types ────────────────────────────────────────────────────

interface WeeklyVolume {
  week_label: string;
  swim_hours: number; bike_hours: number; run_hours: number; total_hours: number;
  swim_miles: number; bike_miles: number; run_miles: number; total_miles: number;
}
interface SportBreakdown { swim_pct: number; bike_pct: number; run_pct: number; }
interface StravaInsightsResponse {
  connected: boolean;
  weekly_volumes: WeeklyVolume[];
  sport_breakdown: SportBreakdown;
  total_activities: number;
}

const BAR_CHART_HEIGHT = 160;
const SPORT_SEGMENTS = [
  { key: "run" as const,  hours: "run_hours" as const,  miles: "run_miles" as const,  color: "#F97316", label: "Run" },
  { key: "bike" as const, hours: "bike_hours" as const, miles: "bike_miles" as const, color: "#22C55E", label: "Bike" },
  { key: "swim" as const, hours: "swim_hours" as const, miles: "swim_miles" as const, color: "#3B82F6", label: "Swim" },
];

function WeeklyBarChart({ weeks, colors }: { weeks: WeeklyVolume[]; colors: ThemeColors }) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const maxHours = Math.max(...weeks.map((w) => w.total_hours), 1);
  const gridLines = [maxHours, maxHours / 2];
  const selected = selectedIdx !== null ? weeks[selectedIdx] : null;

  return (
    <View>
      <View style={{ flexDirection: "row" }}>
        {/* Y-axis labels */}
        <View style={{ width: 30, height: BAR_CHART_HEIGHT, justifyContent: "space-between",
          alignItems: "flex-end", paddingRight: 6, paddingBottom: 2 }}>
          {gridLines.map((v) => (
            <Text key={v} style={{ fontSize: 9, color: colors.lightGray }}>{v.toFixed(0)}h</Text>
          ))}
          <Text style={{ fontSize: 9, color: colors.lightGray }}>0h</Text>
        </View>

        {/* Bars + grid */}
        <View style={{ flex: 1, height: BAR_CHART_HEIGHT, position: "relative" }}>
          {/* Grid lines */}
          {[1, 0.5, 0].map((pct) => (
            <View key={pct} style={{ position: "absolute", left: 0, right: 0,
              top: BAR_CHART_HEIGHT * (1 - pct), height: 1, backgroundColor: colors.darkGray }} />
          ))}

          {/* Bar columns */}
          <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-end",
            paddingHorizontal: 2, gap: 5, height: BAR_CHART_HEIGHT }}>
            {weeks.map((week, i) => {
              const total = week.total_hours;
              const barH = total > 0 ? Math.max((total / maxHours) * BAR_CHART_HEIGHT, 3) : 3;
              const isSelected = selectedIdx === i;
              return (
                <TouchableOpacity key={i} style={{ flex: 1, alignItems: "center", height: BAR_CHART_HEIGHT,
                  justifyContent: "flex-end" }}
                  onPress={() => setSelectedIdx(selectedIdx === i ? null : i)}
                  activeOpacity={0.8}
                >
                  <View style={{ width: "100%", height: barH, borderRadius: 4, overflow: "hidden",
                    opacity: selectedIdx !== null && !isSelected ? 0.4 : 1,
                    borderWidth: isSelected ? 1.5 : 0, borderColor: colors.primary }}>
                    {total > 0 ? SPORT_SEGMENTS.map(({ key, hours, color }) => {
                      const segH = (week[hours] / total) * barH;
                      return segH > 0 ? (
                        <View key={key} style={{ width: "100%", height: segH, backgroundColor: color }} />
                      ) : null;
                    }) : (
                      <View style={{ flex: 1, backgroundColor: colors.darkGray }} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      {/* Week labels */}
      <View style={{ flexDirection: "row", marginLeft: 30, marginTop: SPACING.xs, gap: 5, paddingHorizontal: 2 }}>
        {weeks.map((wk, i) => (
          <Text key={i} numberOfLines={1} style={{ flex: 1, fontSize: 9, textAlign: "center",
            color: selectedIdx === i ? colors.primary : colors.lightGray }}>
            {wk.week_label}
          </Text>
        ))}
      </View>

      {/* Selected week detail */}
      {selected && (
        <View style={{ backgroundColor: colors.darkGray, borderRadius: BORDER_RADIUS.md,
          padding: SPACING.md, marginTop: SPACING.md, gap: SPACING.xs }}>
          <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: "700", color: colors.white,
            marginBottom: SPACING.xs }}>
            Week of {selected.week_label}
          </Text>
          {SPORT_SEGMENTS.slice().reverse().map(({ label, hours, miles, color }) =>
            selected[hours] > 0 ? (
              <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
                <Text style={{ fontSize: FONT_SIZES.sm, color: colors.lightGray, flex: 1 }}>{label}</Text>
                <Text style={{ fontSize: FONT_SIZES.sm, color: colors.white, fontWeight: "600" }}>
                  {selected[hours].toFixed(1)}h · {selected[miles].toFixed(1)} mi
                </Text>
              </View>
            ) : null
          )}
          <View style={{ borderTopWidth: 1, borderTopColor: colors.mediumGray,
            marginTop: SPACING.xs, paddingTop: SPACING.xs,
            flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: "700", color: colors.lightGray }}>Total</Text>
            <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: "700", color: colors.primary }}>
              {selected.total_hours.toFixed(1)}h · {selected.total_miles.toFixed(1)} mi
            </Text>
          </View>
        </View>
      )}

      {/* Legend */}
      <View style={{ flexDirection: "row", gap: SPACING.md, marginTop: SPACING.md }}>
        {SPORT_SEGMENTS.slice().reverse().map(({ label, color }) => (
          <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
            <Text style={{ fontSize: FONT_SIZES.xs, color: colors.lightGray }}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const MIN_RACE_DATE = new Date();
MIN_RACE_DATE.setMonth(MIN_RACE_DATE.getMonth() + 1);

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const race = new Date(dateStr);
  return Math.max(0, Math.round((race.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

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

export default function ProfileScreen() {
  const { user } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [stravaAthlete, setStravaAthlete] = useState<{ name: string; id: number } | null>(null);
  const [stravaLoading, setStravaLoading] = useState(false);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const [insights, setInsights] = useState<StravaInsightsResponse | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    fetch(`${API_URL}/profiles/${user.id}`)
      .then((res) => res.json())
      .then((data) => setProfile(data))
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch(`${API_URL}/strava/status?user_id=${user.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.connected && data.athlete_name) {
          setStravaAthlete({ name: data.athlete_name, id: data.athlete_id });
        }
      })
      .catch(() => {});

    fetch(`${API_URL}/strava/insights?user_id=${user.id}`)
      .then((res) => res.json())
      .then((data) => setInsights(data))
      .catch(() => {})
      .finally(() => setInsightsLoading(false));
  }, [user]);

  const handleConnectStrava = async () => {
    if (!user) return;
    setStravaLoading(true);
    try {
      const authUrl =
        `https://www.strava.com/oauth/authorize` +
        `?client_id=${STRAVA_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(STRAVA_REDIRECT_URI)}` +
        `&response_type=code` +
        `&scope=${STRAVA_SCOPE}` +
        `&approval_prompt=auto`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, STRAVA_REDIRECT_URI);

      if (result.type !== "success") return;

      const url = new URL(result.url);
      const code = url.searchParams.get("code");
      if (!code) throw new Error("No code returned from Strava");

      const res = await fetch(`${API_URL}/strava/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, code }),
      });
      if (!res.ok) throw new Error("Exchange failed");

      const data = await res.json();
      setStravaAthlete({ name: data.athlete_name, id: data.athlete_id });
    } catch {
      Alert.alert("Error", "Could not connect Strava. Please try again.");
    } finally {
      setStravaLoading(false);
    }
  };

  const handleDisconnectStrava = async () => {
    if (!user) return;
    Alert.alert("Disconnect Strava", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: async () => {
          await fetch(`${API_URL}/strava/disconnect?user_id=${user.id}`, { method: "DELETE" });
          setStravaAthlete(null);
        },
      },
    ]);
  };

  const handleSignOut = () => supabase.auth.signOut();

  const handleEditPress = () => {
    if (!profile) return;
    setDraft(profileToDraft(profile));
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setDraft(null);
  };

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

      setProfile({
        ...profile,
        goal: draft.goal,
        experience: draft.experience,
        strongest_discipline: draft.strongest_discipline,
        weakest_discipline: draft.weakest_discipline,
        race_date: draft.race_date,
        weekly_hours: isNaN(parsedHours) ? profile.weekly_hours : parsedHours,
        days_available: isNaN(parsedDays) ? profile.days_available : parsedDays,
      });
      setEditing(false);
      setDraft(null);
    } catch {
      Alert.alert("Error", "Could not save changes.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </Screen>
    );
  }

  const countdown = profile ? daysUntil(profile.race_date) : 0;
  const weeksUntil = Math.floor(countdown / 7);

  const draftDate = draft?.race_date ? new Date(draft.race_date) : MIN_RACE_DATE;

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.title}>Profile</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={toggleTheme} style={styles.iconButton}>
              <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={colors.lightGray} />
            </TouchableOpacity>
            {profile && !editing && (
              <TouchableOpacity onPress={handleEditPress} style={styles.iconButton}>
                <Ionicons name="pencil-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Race Countdown */}
        {profile && (
          <Card style={[styles.countdownCard, { borderColor: colors.primary + "40" }]}>
            <Text style={[styles.countdownValue, { color: colors.primary }]}>{weeksUntil}</Text>
            <Text style={[styles.countdownLabel, { color: colors.lightGray }]}>weeks to race day</Text>
            <Text style={[styles.countdownDate, { color: colors.white }]}>{formatDate(profile.race_date)}</Text>
          </Card>
        )}

        {/* ── EDIT MODE ── */}
        {editing && draft && (
          <>
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
                      <Text style={[styles.pillText, draft.strongest_discipline === opt && styles.pillTextActive]}>
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
                      <Text style={[styles.pillText, draft.weakest_discipline === opt && styles.pillTextActive]}>
                        {LABELS[opt]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </EditFieldRow>
            </Card>

            {/* Race Date — native inline calendar (Apple HIG) */}
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

            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelButton} onPress={handleCancel} disabled={saving}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── VIEW MODE ── */}
        {!editing && (
          <>
            {/* Progress section */}
            {insights?.connected && insights.weekly_volumes.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Training Progress</Text>
                <Card style={styles.section}>
                  <WeeklyBarChart weeks={insights.weekly_volumes} colors={colors} />
                </Card>
              </>
            )}

            {profile && (
              <Card style={styles.section}>
                <Text style={styles.sectionTitle}>Training</Text>
                <View style={styles.row}>
                  <InfoItem label="Goal" value={LABELS[profile.goal] ?? profile.goal} colors={colors} />
                  <InfoItem label="Experience" value={LABELS[profile.experience] ?? profile.experience} colors={colors} />
                </View>
                <View style={styles.row}>
                  <InfoItem label="Weekly Hours" value={`${profile.weekly_hours}h`} colors={colors} />
                  <InfoItem label="Days / Week" value={`${profile.days_available} days`} colors={colors} />
                </View>
              </Card>
            )}

            {profile && (
              <Card style={styles.section}>
                <Text style={styles.sectionTitle}>Disciplines</Text>
                <View style={styles.row}>
                  <DisciplineItem label="Strongest" sport={profile.strongest_discipline} icon="trophy-outline" colors={colors} />
                  <DisciplineItem label="Focus"     sport={profile.weakest_discipline}   icon="flag-outline"   colors={colors} />
                </View>
              </Card>
            )}

            <Card style={styles.section}>
              <Text style={styles.sectionTitle}>Connections</Text>
              <View style={styles.connectionRow}>
                <View style={styles.connectionInfo}>
                  <View style={[styles.connectionIcon, { backgroundColor: "#FC4C02" }]}>
                    <FontAwesome5 name="strava" size={18} color="#FFFFFF" />
                  </View>
                  <View>
                    <Text style={styles.connectionName}>Strava</Text>
                    <Text style={styles.connectionSubtitle}>
                      {stravaAthlete ? stravaAthlete.name : "Not connected"}
                    </Text>
                  </View>
                </View>
                {stravaAthlete ? (
                  <TouchableOpacity onPress={handleDisconnectStrava}>
                    <Text style={styles.disconnectText}>Disconnect</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.connectButton}
                    onPress={handleConnectStrava}
                    disabled={stravaLoading}
                  >
                    {stravaLoading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.connectButtonText}>Connect</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </Card>

            <Card style={styles.section}>
              <Text style={styles.sectionTitle}>Account</Text>
              <Text style={styles.email}>{user?.email}</Text>
            </Card>

            <TouchableOpacity
              style={styles.devButton}
              onPress={() => router.push("/onboarding/race-date?test=true")}
            >
              <Ionicons name="construct-outline" size={16} color={colors.lightGray} />
              <Text style={styles.devButtonText}>Test Onboarding</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InfoItem({ label, value, colors }: { label: string; value: string; colors: ThemeColors }) {
  return (
    <View style={{ flex: 1, gap: SPACING.xs }}>
      <Text style={{ fontSize: FONT_SIZES.xs, color: colors.lightGray }}>{label}</Text>
      <Text style={{ fontSize: FONT_SIZES.md, fontWeight: "600", color: colors.white }}>{value}</Text>
    </View>
  );
}

function DisciplineItem({ label, sport, icon, colors }: { label: string; sport: string; icon: string; colors: ThemeColors }) {
  return (
    <View style={{ flex: 1, gap: SPACING.xs }}>
      <Text style={{ fontSize: FONT_SIZES.xs, color: colors.lightGray }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.xs }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SPORT_COLORS_PROFILE[sport] }} />
        <Ionicons name={icon as never} size={14} color={colors.lightGray} />
        <Text style={{ fontSize: FONT_SIZES.md, fontWeight: "600", color: colors.white }}>{LABELS[sport] ?? sport}</Text>
      </View>
    </View>
  );
}

function EditFieldRow({ label, children, colors }: { label: string; children: React.ReactNode; colors: ThemeColors }) {
  return (
    <View style={{ gap: SPACING.xs }}>
      <Text style={{ fontSize: FONT_SIZES.xs, color: colors.lightGray }}>{label}</Text>
      {children}
    </View>
  );
}

// ── Styles factory ────────────────────────────────────────────────────────────

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    centered: {
      justifyContent: "center",
      alignItems: "center",
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: SPACING.md,
    },
    title: {
      fontSize: FONT_SIZES.xxl,
      fontWeight: "bold",
      color: colors.white,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
    },
    iconButton: {
      padding: SPACING.xs,
    },
    editButton: {
      padding: SPACING.xs,
    },
    countdownCard: {
      alignItems: "center",
      marginBottom: SPACING.md,
      paddingVertical: SPACING.xl,
      backgroundColor: colors.darkGray,
      borderWidth: 1,
    },
    countdownValue: {
      fontSize: 64,
      fontWeight: "800",
      lineHeight: 70,
    },
    countdownLabel: {
      fontSize: FONT_SIZES.md,
      marginTop: SPACING.xs,
    },
    countdownDate: {
      fontSize: FONT_SIZES.sm,
      marginTop: SPACING.sm,
      fontWeight: "600",
    },
    sectionLabel: {
      fontSize: FONT_SIZES.xs,
      fontWeight: "600",
      color: colors.lightGray,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: SPACING.sm,
    },
    statsRow: {
      flexDirection: "row",
      gap: SPACING.sm,
      marginBottom: SPACING.md,
    },
    divider: {
      height: 1,
      backgroundColor: colors.darkGray,
    },
    section: {
      marginBottom: SPACING.md,
      gap: SPACING.md,
    },
    sectionTitle: {
      fontSize: FONT_SIZES.xs,
      fontWeight: "700",
      color: colors.lightGray,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    row: {
      flexDirection: "row",
      gap: SPACING.md,
    },
    email: {
      fontSize: FONT_SIZES.md,
      color: colors.lightGray,
    },
    connectionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    connectionInfo: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.md,
    },
    connectionIcon: {
      width: 36,
      height: 36,
      borderRadius: BORDER_RADIUS.sm,
      alignItems: "center",
      justifyContent: "center",
    },
    connectionName: {
      fontSize: FONT_SIZES.md,
      fontWeight: "600",
      color: colors.white,
    },
    connectionSubtitle: {
      fontSize: FONT_SIZES.xs,
      color: colors.lightGray,
      marginTop: 2,
    },
    connectButton: {
      backgroundColor: "#FC4C02",
      paddingVertical: SPACING.xs,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.md,
      minWidth: 80,
      alignItems: "center",
    },
    connectButtonText: {
      color: "#FFFFFF",
      fontWeight: "600",
      fontSize: FONT_SIZES.sm,
    },
    disconnectText: {
      fontSize: FONT_SIZES.sm,
      color: colors.lightGray,
    },
    devButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: SPACING.sm,
      borderWidth: 1,
      borderColor: colors.mediumGray,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
    },
    devButtonText: {
      fontSize: FONT_SIZES.sm,
      color: colors.lightGray,
    },
    signOutButton: {
      borderWidth: 1,
      borderColor: colors.lightGray + "60",
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.md,
      alignItems: "center",
      marginBottom: SPACING.xl,
    },
    signOutText: {
      fontSize: FONT_SIZES.md,
      color: colors.lightGray,
      fontWeight: "600",
    },
    textInput: {
      backgroundColor: colors.darkGray,
      borderRadius: BORDER_RADIUS.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      fontSize: FONT_SIZES.md,
      color: colors.white,
    },
    pillRow: {
      flexDirection: "row",
      gap: SPACING.sm,
      flexWrap: "wrap",
    },
    pill: {
      backgroundColor: colors.darkGray,
      paddingVertical: SPACING.xs,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.xl,
    },
    pillActive: {
      backgroundColor: colors.primary,
    },
    pillText: {
      fontSize: FONT_SIZES.sm,
      color: colors.lightGray,
      fontWeight: "500",
    },
    pillTextActive: {
      color: colors.background,
      fontWeight: "700",
    },
    datePicker: {
      alignSelf: "stretch",
    },
    saveButton: {
      backgroundColor: colors.primary,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.md,
      alignItems: "center",
      marginBottom: SPACING.sm,
    },
    saveButtonDisabled: {
      opacity: 0.6,
    },
    saveButtonText: {
      fontSize: FONT_SIZES.md,
      fontWeight: "700",
      color: colors.background,
    },
    cancelButton: {
      borderWidth: 1,
      borderColor: colors.lightGray + "60",
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.md,
      alignItems: "center",
      marginBottom: SPACING.xl,
    },
    cancelButtonText: {
      fontSize: FONT_SIZES.md,
      color: colors.lightGray,
      fontWeight: "600",
    },
  });
