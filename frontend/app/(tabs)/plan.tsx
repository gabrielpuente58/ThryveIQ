import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Screen } from "../../components/Screen";
import { DayCard } from "../../components/DayCard";
import { API_URL } from "../../constants/api";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";

interface Session {
  id: string;
  week: number;
  day: string;
  sport: string;
  duration_minutes: number;
  zone: number;
  zone_label: string;
  description: string;
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
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPlan = async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API_URL}/plans/current?user_id=${user.id}`);
      if (!res.ok) throw new Error("No plan found");
      const data: Plan = await res.json();
      setPlan(data);
      setError(null);
    } catch {
      setError("Could not load your plan. Generate one first.");
    } finally {
      setLoading(false);
    }
  };

  const regeneratePlan = async () => {
    if (!user) return;
    setRegenerating(true);
    try {
      const res = await fetch(`${API_URL}/plans/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id }),
      });
      if (!res.ok) throw new Error("Failed to generate plan");
      const data: Plan = await res.json();
      setPlan(data);
      setSelectedWeek(1);
      setError(null);
    } catch {
      setError("Failed to regenerate plan. Please try again.");
    } finally {
      setRegenerating(false);
    }
  };

  useEffect(() => {
    fetchPlan();
  }, [user]);

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

  const DAYS_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const weeks = Array.from({ length: plan.weeks_until_race }, (_, i) => i + 1);
  const weekSessions = plan.sessions.filter((s) => s.week === selectedWeek);

  const sessionsByDay = DAYS_ORDER.reduce<Record<string, typeof weekSessions>>(
    (acc, day) => {
      const daySessions = weekSessions.filter((s) => s.day === day);
      if (daySessions.length > 0) acc[day] = daySessions;
      return acc;
    },
    {}
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Your Training Plan</Text>
        <TouchableOpacity
          style={[styles.regenButton, regenerating && styles.regenButtonDisabled]}
          onPress={regeneratePlan}
          disabled={regenerating}
        >
          {regenerating ? (
            <ActivityIndicator size="small" color={COLORS.background} />
          ) : (
            <Text style={styles.regenButtonText}>Regenerate</Text>
          )}
        </TouchableOpacity>
      </View>

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
        {Object.entries(sessionsByDay).map(([day, sessions]) => (
          <DayCard key={day} day={day} sessions={sessions} />
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: "bold",
    color: COLORS.white,
  },
  regenButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    minWidth: 100,
    alignItems: "center",
  },
  regenButtonDisabled: {
    opacity: 0.5,
  },
  regenButtonText: {
    color: COLORS.background,
    fontWeight: "600",
    fontSize: FONT_SIZES.sm,
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
