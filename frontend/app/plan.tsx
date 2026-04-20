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
import { Screen } from "../components/Screen";
import { SessionCard } from "../components/SessionCard";
import { useAuth } from "../context/AuthContext";
import { API_URL } from "../constants/api";
import { COLORS, ThemeColors, SPACING, FONT_SIZES, BORDER_RADIUS } from "../constants/theme";

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
}

interface Plan {
  id: string;
  weeks_until_race: number;
  sessions: Session[];
}

export default function PlanScreen() {
  const { user } = useAuth();
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
        .catch(() => setError("Could not load your plan. Generate one first."))
        .finally(() => setLoading(false));
    }, [user])
  );

  if (loading) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </Screen>
    );
  }

  if (error || !plan) {
    return (
      <Screen style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </Screen>
    );
  }

  const weeks = Array.from({ length: plan.weeks_until_race }, (_, i) => i + 1);
  const weekSessions = plan.sessions.filter((s) => s.week === selectedWeek);

  return (
    <Screen>
      <Text style={styles.title}>Your Training Plan</Text>

      <View style={styles.pillsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.pillsRow}>
            {weeks.map((week) => (
              <TouchableOpacity
                key={week}
                style={[styles.pill, selectedWeek === week && styles.pillSelected]}
                onPress={() => setSelectedWeek(week)}
              >
                <Text
                  style={[
                    styles.pillText,
                    selectedWeek === week && styles.pillTextSelected,
                  ]}
                >
                  W{week}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView style={styles.sessionList} showsVerticalScrollIndicator={false}>
        {weekSessions.map((session) => (
          <SessionCard
            key={session.id}
            sport={session.sport}
            duration_minutes={session.duration_minutes}
            zone={session.zone}
            zone_label={session.zone_label}
            description={session.description}
            distance_yards={session.distance_yards}
          />
        ))}
      </ScrollView>
    </Screen>
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
  errorText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.lightGray,
    textAlign: "center",
  },
  pillsContainer: {
    marginBottom: SPACING.md,
  },
  pillsRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  pill: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.mediumGray,
  },
  pillSelected: {
    backgroundColor: COLORS.primary,
  },
  pillText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.lightGray,
  },
  pillTextSelected: {
    color: COLORS.background,
  },
  sessionList: {
    flex: 1,
  },
});
