import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView } from "react-native";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import { API_URL } from "../../constants/api";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../constants/theme";

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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetch(`${API_URL}/profiles/${user.id}`)
      .then((res) => res.json())
      .then((data) => setProfile(data))
      .finally(() => setLoading(false));
  }, [user]);

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
              <DisciplineItem label="Strongest" sport={profile.strongest_discipline} tag="💪" />
              <DisciplineItem label="Focus" sport={profile.weakest_discipline} tag="🎯" />
            </View>
          </Card>
        )}

        {/* Account */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </Card>

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

function DisciplineItem({ label, sport, tag }: { label: string; sport: string; tag: string }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.disciplineRow}>
        <View style={[styles.disciplineDot, { backgroundColor: SPORT_COLORS[sport] }]} />
        <Text style={styles.infoValue}>{tag} {LABELS[sport] ?? sport}</Text>
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
