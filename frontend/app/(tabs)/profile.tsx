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

// ── Progress / chart types + constants ────────────────────────────────────────

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
interface ChartPoint { x: number; swim: number; bike: number; run: number; total: number; }

type LineDataKey = "swim" | "bike" | "run" | "total";
type ChartSelection = { idx: number; sport: LineDataKey } | null;

const CHART_SPORT_COLORS = {
  swim: "#3B82F6", bike: "#22C55E", run: "#F97316", total: "#A78BFA",
} as const;
const SPORT_KEYS: LineDataKey[] = ["total", "swim", "bike", "run"];
const SPORT_HOURS_KEY: Record<LineDataKey, keyof WeeklyVolume> = {
  swim: "swim_hours", bike: "bike_hours", run: "run_hours", total: "total_hours",
};
const SPORT_MILES_KEY: Record<LineDataKey, keyof WeeklyVolume> = {
  swim: "swim_miles", bike: "bike_miles", run: "run_miles", total: "total_miles",
};
const SPORT_LABEL: Record<LineDataKey, string> = {
  swim: "Swim", bike: "Bike", run: "Run", total: "Total",
};

const CHART_HEIGHT = 180;
const Y_AXIS_WIDTH = 36;
const TOOLTIP_WIDTH = 140;

// ── Chart helper functions ────────────────────────────────────────────────────

function toCoords(points: ChartPoint[], key: LineDataKey, maxY: number, w: number, h: number) {
  const n = points.length;
  return points.map((p, i) => ({
    x: n < 2 ? w / 2 : (i / (n - 1)) * w,
    y: h - Math.max(0, (p[key] / maxY) * h),
  }));
}

function Polyline({
  pts, color, strokeWidth = 2.5, selectedIdx, onDotPress,
}: {
  pts: { x: number; y: number }[];
  color: string;
  strokeWidth?: number;
  selectedIdx: number | null;
  onDotPress: (index: number) => void;
}) {
  const elements: React.ReactElement[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const { x: x1, y: y1 } = pts[i];
    const { x: x2, y: y2 } = pts[i + 1];
    const dx = x2 - x1; const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.5) continue;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    elements.push(
      <View key={`s${i}`} style={{
        position: "absolute", left: (x1 + x2) / 2 - len / 2,
        top: (y1 + y2) / 2 - strokeWidth / 2, width: len, height: strokeWidth,
        backgroundColor: color, borderRadius: strokeWidth / 2,
        transform: [{ rotate: `${angle}deg` }],
      }} />,
    );
  }
  pts.forEach((pt, i) => {
    const isSelected = selectedIdx === i;
    const r = isSelected ? strokeWidth + 3 : strokeWidth + 0.5;
    const hitR = 16;
    elements.push(
      <TouchableOpacity key={`d${i}`} onPress={() => onDotPress(i)}
        style={{ position: "absolute", left: pt.x - hitR, top: pt.y - hitR,
          width: hitR * 2, height: hitR * 2, alignItems: "center", justifyContent: "center" }}
        activeOpacity={0.7}>
        <View style={{ width: r * 2, height: r * 2, borderRadius: r,
          backgroundColor: color, borderWidth: isSelected ? 2 : 0, borderColor: "#FFFFFF" }} />
      </TouchableOpacity>,
    );
  });
  return <>{elements}</>;
}

function LineChart({
  chartData, weeklyData, maxHours, visible, colors,
}: {
  chartData: ChartPoint[]; weeklyData: WeeklyVolume[]; maxHours: number;
  visible: Record<LineDataKey, boolean>; colors: ThemeColors;
}) {
  const [w, setW] = useState(0);
  const [selection, setSelection] = useState<ChartSelection>(null);
  const h = CHART_HEIGHT; const maxY = maxHours * 1.15;
  const gridPcts = [0, 0.5, 1]; const n = chartData.length;
  const xOf = (i: number) => (n < 2 ? w / 2 : (i / (n - 1)) * w);
  const tooltipLeft = (idx: number) =>
    Math.min(Math.max(xOf(idx) - TOOLTIP_WIDTH / 2, 0), w - TOOLTIP_WIDTH);
  const handleDotPress = (sport: LineDataKey, idx: number) =>
    setSelection((prev) => prev?.idx === idx && prev?.sport === sport ? null : { idx, sport });
  const week = selection ? weeklyData[selection.idx] : null;
  const sportColor = selection ? CHART_SPORT_COLORS[selection.sport] : colors.primary;

  return (
    <View style={{ flexDirection: "row", height: h + 48 }}>
      <View style={{ width: Y_AXIS_WIDTH, height: h, justifyContent: "space-between",
        alignItems: "flex-end", paddingRight: SPACING.xs }}>
        {[...gridPcts].reverse().map((pct) => (
          <Text key={pct} style={{ fontSize: 9, color: colors.lightGray }}>
            {(maxY * pct).toFixed(1)}h
          </Text>
        ))}
      </View>
      <View style={{ flex: 1 }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w > 0 && (
          <View style={{ width: w, height: h, position: "relative" }}>
            {gridPcts.map((pct) => (
              <View key={pct} style={{ position: "absolute", left: 0, top: h - pct * h,
                width: w, height: 1, backgroundColor: colors.darkGray }} />
            ))}
            {SPORT_KEYS.map((key) => visible[key] ? (
              <Polyline key={key} pts={toCoords(chartData, key, maxY, w, h)}
                color={CHART_SPORT_COLORS[key]}
                selectedIdx={selection?.sport === key ? selection.idx : null}
                onDotPress={(idx) => handleDotPress(key, idx)} />
            ) : null)}
            {selection && (
              <View pointerEvents="none" style={{ position: "absolute", left: xOf(selection.idx) - 1,
                top: 0, width: 2, height: h, backgroundColor: sportColor + "50" }} />
            )}
            {week && selection && (
              <View pointerEvents="none" style={{ position: "absolute", top: -52,
                left: tooltipLeft(selection.idx), width: TOOLTIP_WIDTH,
                backgroundColor: colors.mediumGray, borderRadius: BORDER_RADIUS.sm,
                borderWidth: 1, borderColor: sportColor + "80",
                paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.xs, marginBottom: 2 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: sportColor }} />
                  <Text style={{ fontSize: 9, color: colors.lightGray, fontWeight: "600" }}>
                    {SPORT_LABEL[selection.sport]} · {week.week_label}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 11, color: colors.white, fontWeight: "700" }}>
                    {(week[SPORT_HOURS_KEY[selection.sport]] as number).toFixed(1)}h
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.white, fontWeight: "700" }}>
                    {(week[SPORT_MILES_KEY[selection.sport]] as number).toFixed(1)} mi
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

function SportToggle({ visible, onToggle, colors }: {
  visible: Record<LineDataKey, boolean>; onToggle: (k: LineDataKey) => void; colors: ThemeColors;
}) {
  return (
    <View style={chartStyles.toggleRow}>
      {SPORT_KEYS.map((key) => {
        const active = visible[key]; const color = CHART_SPORT_COLORS[key];
        return (
          <TouchableOpacity key={key} onPress={() => onToggle(key)} activeOpacity={0.7}
            style={[chartStyles.togglePill,
              { borderColor: color, backgroundColor: active ? color + "22" : "transparent" }]}>
            <View style={[chartStyles.toggleDot, { backgroundColor: active ? color : colors.darkGray }]} />
            <Text style={[chartStyles.toggleLabel, { color: active ? color : colors.lightGray }]}>
              {SPORT_LABEL[key]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function WeekLabels({ weeks, colors }: { weeks: WeeklyVolume[]; colors: ThemeColors }) {
  const [w, setW] = useState(0);
  return (
    <View style={{ flexDirection: "row", marginTop: SPACING.xs, marginLeft: Y_AXIS_WIDTH }}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {weeks.map((wk, i) => (
        <Text key={i} numberOfLines={1}
          style={{ fontSize: 9, color: colors.lightGray, textAlign: "center",
            width: w > 0 ? w / weeks.length : 0 }}>
          {wk.week_label}
        </Text>
      ))}
    </View>
  );
}

function SportBreakdownRow({ name, pct, color, colors }: {
  name: string; pct: number; color: string; colors: ThemeColors;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: SPACING.sm }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginRight: SPACING.sm }} />
      <Text style={{ fontSize: FONT_SIZES.sm, color: colors.white, width: 36 }}>{name}</Text>
      <Text style={{ fontSize: FONT_SIZES.sm, color: colors.lightGray, width: 36, textAlign: "right", marginRight: SPACING.sm }}>{pct}%</Text>
      <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.darkGray, overflow: "hidden" }}>
        <View style={{ height: 6, borderRadius: 3, width: `${pct}%` as `${number}%`, backgroundColor: color }} />
      </View>
    </View>
  );
}

function StatPill({ label, value, colors }: { label: string; value: string; colors: ThemeColors }) {
  return (
    <View style={[chartStyles.statPill, { backgroundColor: colors.darkGray }]}>
      <Text style={{ fontSize: FONT_SIZES.lg, fontWeight: "700", color: colors.primary }}>{value}</Text>
      <Text style={{ fontSize: FONT_SIZES.xs, color: colors.lightGray, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  toggleRow: { flexDirection: "row", gap: SPACING.sm },
  togglePill: { flexDirection: "row", alignItems: "center", gap: SPACING.xs,
    paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.xl, borderWidth: 1 },
  toggleDot: { width: 7, height: 7, borderRadius: 3.5 },
  toggleLabel: { fontSize: FONT_SIZES.xs, fontWeight: "600" },
  statPill: { flex: 1, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, alignItems: "center" },
});

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
  const [chartVisible, setChartVisible] = useState<Record<LineDataKey, boolean>>({
    total: true, swim: true, bike: true, run: true,
  });
  const toggleChartSport = (key: LineDataKey) =>
    setChartVisible((prev) => ({ ...prev, [key]: !prev[key] }));

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
            {insights?.connected && insights.weekly_volumes.length > 0 && (() => {
              const maxHours = Math.max(...insights.weekly_volumes.map((w) => w.total_hours), 1);
              const chartData: ChartPoint[] = insights.weekly_volumes.map((w, i) => ({
                x: i, swim: w.swim_hours, bike: w.bike_hours, run: w.run_hours, total: w.total_hours,
              }));
              return (
                <>
                  <Text style={styles.sectionLabel}>Training Progress</Text>
                  <Card style={[styles.section, { paddingBottom: SPACING.xs }]}>
                    <SportToggle visible={chartVisible} onToggle={toggleChartSport} colors={colors} />
                    <View style={{ marginTop: SPACING.sm }}>
                      <LineChart chartData={chartData} weeklyData={insights.weekly_volumes}
                        maxHours={maxHours} visible={chartVisible} colors={colors} />
                    </View>
                    <WeekLabels weeks={insights.weekly_volumes} colors={colors} />
                  </Card>
                </>
              );
            })()}

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
              onPress={() => router.push("/onboarding/goal?test=true")}
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
