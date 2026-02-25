import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import { API_URL } from "../../constants/api";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../constants/theme";

const STRAVA_CLIENT_ID = process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID;
const STRAVA_REDIRECT_URI = "thryveiq://strava-callback";
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

const SPORT_COLORS: Record<string, string> = {
  swim: "#3B82F6",
  bike: "#22C55E",
  run: "#F97316",
};

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
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [stravaAthlete, setStravaAthlete] = useState<{ name: string; id: number } | null>(null);
  const [stravaLoading, setStravaLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch(`${API_URL}/profiles/${user.id}`)
      .then((res) => res.json())
      .then((data) => setProfile(data))
      .finally(() => setLoading(false));

    fetch(`${API_URL}/strava/status?user_id=${user.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.connected && data.athlete_name) {
          setStravaAthlete({ name: data.athlete_name, id: data.athlete_id });
        }
      })
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
        <ActivityIndicator size="large" color={COLORS.primary} />
      </Screen>
    );
  }

  const countdown = profile ? daysUntil(profile.race_date) : 0;
  const weeksUntil = Math.floor(countdown / 7);

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Profile</Text>

        {/* Race Countdown */}
        {profile && (
          <Card style={styles.countdownCard}>
            <Text style={styles.countdownValue}>{weeksUntil}</Text>
            <Text style={styles.countdownLabel}>weeks to race day</Text>
            <Text style={styles.countdownDate}>{formatDate(profile.race_date)}</Text>
          </Card>
        )}

        {/* Training Info */}
        {profile && (
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Training</Text>
            <View style={styles.row}>
              <InfoItem label="Goal" value={LABELS[profile.goal] ?? profile.goal} />
              <InfoItem label="Experience" value={LABELS[profile.experience] ?? profile.experience} />
            </View>
            <View style={styles.row}>
              <InfoItem label="Weekly Hours" value={`${profile.weekly_hours}h`} />
              <InfoItem label="Days / Week" value={`${profile.days_available} days`} />
            </View>
          </Card>
        )}

        {/* Disciplines */}
        {profile && (
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Disciplines</Text>
            <View style={styles.row}>
              <DisciplineItem label="Strongest" sport={profile.strongest_discipline} icon="trophy-outline" />
              <DisciplineItem label="Focus" sport={profile.weakest_discipline} icon="flag-outline" />
            </View>
          </Card>
        )}

        {/* Connections */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Connections</Text>
          <View style={styles.connectionRow}>
            <View style={styles.connectionInfo}>
              <View style={[styles.connectionIcon, { backgroundColor: "#FC4C02" }]}>
                <Ionicons name="bicycle" size={18} color={COLORS.white} />
              </View>
              <View>
                <Text style={styles.connectionName}>Strava</Text>
                {stravaAthlete ? (
                  <Text style={styles.connectionSubtitle}>{stravaAthlete.name}</Text>
                ) : (
                  <Text style={styles.connectionSubtitle}>Not connected</Text>
                )}
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
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Text style={styles.connectButtonText}>Connect</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </Card>

        {/* Account */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </Card>

        {/* Dev only — test onboarding without a new account */}
        <TouchableOpacity
          style={styles.devButton}
          onPress={() => router.push("/onboarding/goal?test=true")}
        >
          <Ionicons name="construct-outline" size={16} color={COLORS.lightGray} />
          <Text style={styles.devButtonText}>Test Onboarding</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </Screen>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function DisciplineItem({ label, sport, icon }: { label: string; sport: string; icon: string }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.disciplineRow}>
        <View style={[styles.disciplineDot, { backgroundColor: SPORT_COLORS[sport] }]} />
        <Ionicons name={icon as never} size={14} color={COLORS.lightGray} />
        <Text style={styles.infoValue}>{LABELS[sport] ?? sport}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: SPACING.md,
  },
  countdownCard: {
    alignItems: "center",
    marginBottom: SPACING.md,
    paddingVertical: SPACING.xl,
    backgroundColor: COLORS.darkGray,
    borderWidth: 1,
    borderColor: COLORS.primary + "40",
  },
  countdownValue: {
    fontSize: 64,
    fontWeight: "800",
    color: COLORS.primary,
    lineHeight: 70,
  },
  countdownLabel: {
    fontSize: FONT_SIZES.md,
    color: COLORS.lightGray,
    marginTop: SPACING.xs,
  },
  countdownDate: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.white,
    marginTop: SPACING.sm,
    fontWeight: "600",
  },
  section: {
    marginBottom: SPACING.md,
    gap: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "700",
    color: COLORS.lightGray,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  row: {
    flexDirection: "row",
    gap: SPACING.md,
  },
  infoItem: {
    flex: 1,
    gap: SPACING.xs,
  },
  infoLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.lightGray,
  },
  infoValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.white,
  },
  disciplineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  disciplineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  email: {
    fontSize: FONT_SIZES.md,
    color: COLORS.lightGray,
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
    color: COLORS.white,
  },
  connectionSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.lightGray,
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
    color: COLORS.white,
    fontWeight: "600",
    fontSize: FONT_SIZES.sm,
  },
  disconnectText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.lightGray,
  },
  devButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.mediumGray,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  devButtonText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.lightGray,
  },
  signOutButton: {
    borderWidth: 1,
    borderColor: COLORS.lightGray + "60",
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    alignItems: "center",
    marginBottom: SPACING.xl,
  },
  signOutText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.lightGray,
    fontWeight: "600",
  },
});
