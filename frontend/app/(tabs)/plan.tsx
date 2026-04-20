import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { SessionCard, Interval } from "../../components/SessionCard";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { API_URL } from "../../constants/api";
import { ThemeColors, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../constants/theme";

interface Session {
  id: string;
  week: number;
  day: string;
  sport: string;
  duration_minutes: number;
  zone: number;
  zone_label: string;
  description: string;
  distance_yards?: number | null;
  intervals?: Interval[];
}

interface Plan {
  id: string;
  weeks_until_race: number;
  sessions: Session[];
}

const DAYS_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function PlanScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const [plan, setPlan] = useState<Plan | null>(null);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      setLoading(true);
      setError(null);
      fetch(`${API_URL}/plans/current?user_id=${user.id}`)
        .then((res) => {
          if (!res.ok) throw new Error("No plan found");
          return res.json();
        })
        .then((data: Plan) => {
          setPlan(data);
          setSelectedWeek(1);
        })
        .catch(() => setError("No plan yet. Complete onboarding to generate one."))
        .finally(() => setLoading(false));
    }, [user])
  );

  if (loading) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </Screen>
    );
  }

  if (error || !plan) {
    return (
      <Screen style={styles.centered}>
        <Text style={styles.emptyText}>{error}</Text>
      </Screen>
    );
  }

  const weeks = Array.from({ length: plan.weeks_until_race }, (_, i) => i + 1);
  const weekSessions = plan.sessions.filter((s) => s.week === selectedWeek);

  const totalMinutes = weekSessions.reduce((sum, s) => sum + s.duration_minutes, 0);
  const totalHours = (totalMinutes / 60).toFixed(1);

  const sessionsByDay = DAYS_ORDER.reduce<Record<string, Session[]>>((acc, day) => {
    const daySessions = weekSessions.filter((s) => s.day === day);
    if (daySessions.length > 0) acc[day] = daySessions;
    return acc;
  }, {});

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Training Plan</Text>
        <View style={styles.hoursChip}>
          <Text style={styles.hoursText}>{totalHours}h / week</Text>
        </View>
      </View>

      {/* Week pills */}
      <View style={styles.pillsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.pillsRow}>
            {weeks.map((week) => (
              <TouchableOpacity
                key={week}
                style={[styles.pill, selectedWeek === week && styles.pillSelected]}
                onPress={() => setSelectedWeek(week)}
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, selectedWeek === week && styles.pillTextSelected]}>
                  W{week}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Sessions grouped by day */}
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {Object.entries(sessionsByDay).map(([day, sessions]) => (
          <View key={day} style={styles.dayGroup}>
            <Text style={styles.dayLabel}>{day}</Text>
            {sessions.map((session) => (
              <Card key={session.id} style={styles.sessionCard}>
                <SessionCard
                  id={session.id}
                  sport={session.sport}
                  duration_minutes={session.duration_minutes}
                  zone={session.zone}
                  zone_label={session.zone_label}
                  description={session.description}
                  distance_yards={session.distance_yards}
                  intervals={session.intervals}
                  day={session.day}
                  week={session.week}
                />
              </Card>
            ))}
          </View>
        ))}
        {weekSessions.length === 0 && (
          <Text style={styles.emptyText}>No sessions for this week.</Text>
        )}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    centered: { flex: 1, justifyContent: "center", alignItems: "center" },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: SPACING.md,
    },
    title: { fontSize: FONT_SIZES.xxl, fontWeight: "bold", color: colors.white },
    hoursChip: {
      backgroundColor: colors.darkGray,
      paddingVertical: SPACING.xs,
      paddingHorizontal: SPACING.sm,
      borderRadius: BORDER_RADIUS.xl,
    },
    hoursText: { fontSize: FONT_SIZES.xs, fontWeight: "600", color: colors.primary },
    pillsContainer: { marginBottom: SPACING.md },
    pillsRow: { flexDirection: "row", gap: SPACING.sm },
    pill: {
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.mediumGray,
    },
    pillSelected: { backgroundColor: colors.primary },
    pillText: { fontSize: FONT_SIZES.sm, fontWeight: "600", color: colors.lightGray },
    pillTextSelected: { color: colors.background },
    list: { flex: 1 },
    dayGroup: { marginBottom: SPACING.lg },
    dayLabel: {
      fontSize: FONT_SIZES.sm,
      fontWeight: "700",
      color: colors.lightGray,
      marginBottom: SPACING.sm,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    sessionCard: { padding: SPACING.md },
    emptyText: { fontSize: FONT_SIZES.md, color: colors.lightGray, textAlign: "center" },
  });
