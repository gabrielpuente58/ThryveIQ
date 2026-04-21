import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
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

export default function ProfileScreen() {
  const { user } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [stravaAthlete, setStravaAthlete] = useState<{ name: string; id: number } | null>(null);
  const [stravaLoading, setStravaLoading] = useState(false);

  const [insights, setInsights] = useState<StravaInsightsResponse | null>(null);

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
      .catch(() => {});
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

  if (loading) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </Screen>
    );
  }

  const countdown = profile ? daysUntil(profile.race_date) : 0;
  const weeksUntil = Math.floor(countdown / 7);

  const weeklyVolumes = insights?.weekly_volumes ?? [];
  const hasWeekData = weeklyVolumes.length > 0;
  const thisWeekHours = hasWeekData ? weeklyVolumes[weeklyVolumes.length - 1].total_hours : 0;
  const avgWeekHours = hasWeekData
    ? weeklyVolumes.reduce((sum, w) => sum + w.total_hours, 0) / weeklyVolumes.length
    : 0;
  const totalActivities = insights?.total_activities ?? 0;

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.title}>Dashboard</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={toggleTheme} style={styles.iconButton}>
              <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={colors.lightGray} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/settings")} style={styles.iconButton}>
              <Ionicons name="settings-outline" size={20} color={colors.lightGray} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Race Countdown */}
        {profile && (
          <Card style={[styles.countdownCard, { borderColor: colors.primary + "40" }]}>
            <Text style={[styles.countdownValue, { color: colors.primary }]}>{weeksUntil}</Text>
            <Text style={[styles.countdownLabel, { color: colors.lightGray }]}>weeks to race day</Text>
            <Text style={[styles.countdownDate, { color: colors.white }]}>{profile ? formatDate(profile.race_date) : ""}</Text>
          </Card>
        )}

        {/* Stat tiles */}
        {insights?.connected && (
          <View style={styles.statsRow}>
            <StatTile
              label="This Week"
              value={`${thisWeekHours.toFixed(1)}h`}
              icon="flash-outline"
              colors={colors}
            />
            <StatTile
              label="Weekly Avg"
              value={`${avgWeekHours.toFixed(1)}h`}
              icon="trending-up-outline"
              colors={colors}
            />
            <StatTile
              label="Activities"
              value={String(totalActivities)}
              icon="checkmark-done-outline"
              colors={colors}
            />
          </View>
        )}

        {/* Progress chart */}
        {insights?.connected && hasWeekData && (
          <>
            <Text style={styles.sectionLabel}>Training Progress</Text>
            <Card style={styles.section}>
              <WeeklyBarChart weeks={weeklyVolumes} colors={colors} />
            </Card>
          </>
        )}

        {/* Athlete Snapshot */}
        {profile && (
          <>
            <Text style={styles.sectionLabel}>Athlete Snapshot</Text>
            <Card style={styles.section}>
              <View style={styles.snapshotGrid}>
                <SnapshotItem
                  label="Goal"
                  value={LABELS[profile.goal] ?? profile.goal}
                  icon="flag-outline"
                  colors={colors}
                />
                <SnapshotItem
                  label="Experience"
                  value={LABELS[profile.experience] ?? profile.experience}
                  icon="barbell-outline"
                  colors={colors}
                />
                <SnapshotItem
                  label="Weekly Hours"
                  value={`${profile.weekly_hours}h`}
                  icon="time-outline"
                  colors={colors}
                />
                <SnapshotItem
                  label="Days / Week"
                  value={`${profile.days_available}`}
                  icon="calendar-outline"
                  colors={colors}
                />
              </View>

              <View style={styles.disciplineRow}>
                <DisciplineItem
                  label="Strongest"
                  sport={profile.strongest_discipline}
                  icon="trophy-outline"
                  colors={colors}
                />
                <View style={styles.disciplineDivider} />
                <DisciplineItem
                  label="Focus"
                  sport={profile.weakest_discipline}
                  icon="locate-outline"
                  colors={colors}
                />
              </View>
            </Card>
          </>
        )}

        {/* Connections */}
        <Text style={styles.sectionLabel}>Connections</Text>
        <Card style={styles.section}>
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

        {/* Account + settings row */}
        <TouchableOpacity style={styles.settingsRow} onPress={() => router.push("/settings")}>
          <View style={styles.settingsLeft}>
            <Ionicons name="settings-outline" size={20} color={colors.lightGray} />
            <Text style={styles.settingsText}>Settings</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.lightGray} />
        </TouchableOpacity>

        <View style={styles.accountBlock}>
          <Text style={styles.emailLabel}>Signed in as</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

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
      </ScrollView>
    </Screen>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  icon,
  colors,
}: {
  label: string;
  value: string;
  icon: string;
  colors: ThemeColors;
}) {
  return (
    <View style={{
      flex: 1,
      backgroundColor: colors.darkGray,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.md,
      gap: SPACING.xs,
    }}>
      <Ionicons name={icon as never} size={16} color={colors.primary} />
      <Text style={{ fontSize: FONT_SIZES.xl, fontWeight: "700", color: colors.white }}>{value}</Text>
      <Text style={{ fontSize: FONT_SIZES.xs, color: colors.lightGray }}>{label}</Text>
    </View>
  );
}

function SnapshotItem({
  label,
  value,
  icon,
  colors,
}: {
  label: string;
  value: string;
  icon: string;
  colors: ThemeColors;
}) {
  return (
    <View style={{ width: "48%", gap: SPACING.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.xs }}>
        <Ionicons name={icon as never} size={12} color={colors.lightGray} />
        <Text style={{ fontSize: FONT_SIZES.xs, color: colors.lightGray }}>{label}</Text>
      </View>
      <Text style={{ fontSize: FONT_SIZES.md, fontWeight: "600", color: colors.white }}>{value}</Text>
    </View>
  );
}

function DisciplineItem({
  label,
  sport,
  icon,
  colors,
}: {
  label: string;
  sport: string;
  icon: string;
  colors: ThemeColors;
}) {
  return (
    <View style={{ flex: 1, gap: SPACING.xs, alignItems: "center" }}>
      <Text style={{ fontSize: FONT_SIZES.xs, color: colors.lightGray, textTransform: "uppercase", letterSpacing: 0.8 }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.xs }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: SPORT_COLORS_PROFILE[sport] }} />
        <Ionicons name={icon as never} size={14} color={colors.lightGray} />
        <Text style={{ fontSize: FONT_SIZES.md, fontWeight: "600", color: colors.white }}>
          {LABELS[sport] ?? sport}
        </Text>
      </View>
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
    statsRow: {
      flexDirection: "row",
      gap: SPACING.sm,
      marginBottom: SPACING.md,
    },
    sectionLabel: {
      fontSize: FONT_SIZES.xs,
      fontWeight: "600",
      color: colors.lightGray,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: SPACING.sm,
    },
    section: {
      marginBottom: SPACING.md,
      gap: SPACING.md,
    },
    snapshotGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: SPACING.md,
      rowGap: SPACING.md,
      justifyContent: "space-between",
    },
    disciplineRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingTop: SPACING.md,
      borderTopWidth: 1,
      borderTopColor: colors.darkGray,
    },
    disciplineDivider: {
      width: 1,
      alignSelf: "stretch",
      backgroundColor: colors.darkGray,
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
    settingsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.darkGray,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
      marginBottom: SPACING.md,
    },
    settingsLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.md,
    },
    settingsText: {
      fontSize: FONT_SIZES.md,
      color: colors.white,
      fontWeight: "600",
    },
    accountBlock: {
      gap: SPACING.xs,
      marginBottom: SPACING.md,
      paddingHorizontal: SPACING.xs,
    },
    emailLabel: {
      fontSize: FONT_SIZES.xs,
      color: colors.lightGray,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    email: {
      fontSize: FONT_SIZES.sm,
      color: colors.white,
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
  });
