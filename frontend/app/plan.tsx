import { useState, useCallback, useRef, useEffect } from "react";
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
import { useTheme } from "../context/ThemeContext";
import { API_URL } from "../constants/api";
import { ThemeColors, SPACING, FONT_SIZES, BORDER_RADIUS } from "../constants/theme";

const BLOCK_SIZE = 4;

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
  weeks_generated: number;
  sessions: Session[];
}

export default function PlanScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const [plan, setPlan] = useState<Plan | null>(null);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buildingNext, setBuildingNext] = useState(false);
  const buildingRef = useRef(false);

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

  // Trigger next-block generation when user hits week 2 of any block
  useEffect(() => {
    if (!user || !plan || buildingRef.current) return;
    const blockStart = Math.floor((selectedWeek - 1) / BLOCK_SIZE) * BLOCK_SIZE + 1;
    const weekInBlock = selectedWeek - blockStart + 1;
    const nextBlockStart = blockStart + BLOCK_SIZE;

    const shouldTrigger =
      weekInBlock >= 2 &&
      nextBlockStart <= plan.weeks_until_race &&
      plan.weeks_generated < nextBlockStart;

    if (!shouldTrigger) return;

    buildingRef.current = true;
    setBuildingNext(true);

    fetch(`${API_URL}/plans/generate-next`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: user.id }),
    })
      .then((r) => r.json())
      .then(({ job_id }: { job_id: string }) => {
        const poll = setInterval(async () => {
          try {
            const res = await fetch(`${API_URL}/plans/job/${job_id}`);
            const job = await res.json();
            if (job.status === "done") {
              clearInterval(poll);
              setPlan(job.plan);
              setBuildingNext(false);
              buildingRef.current = false;
            } else if (job.status === "error") {
              clearInterval(poll);
              setBuildingNext(false);
              buildingRef.current = false;
            }
          } catch {
            clearInterval(poll);
            setBuildingNext(false);
            buildingRef.current = false;
          }
        }, 5000);
      })
      .catch(() => {
        setBuildingNext(false);
        buildingRef.current = false;
      });
  }, [selectedWeek, plan?.weeks_generated]);

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
        <Text style={styles.errorText}>{error}</Text>
      </Screen>
    );
  }

  const weeks = Array.from({ length: plan.weeks_until_race }, (_, i) => i + 1);
  const weekSessions = plan.sessions.filter((s) => s.week === selectedWeek);
  const isGenerated = (week: number) => week <= plan.weeks_generated;

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Training Plan</Text>
        {buildingNext && (
          <View style={styles.buildingBadge}>
            <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: SPACING.xs }} />
            <Text style={styles.buildingText}>Building next block…</Text>
          </View>
        )}
      </View>

      <View style={styles.pillsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.pillsRow}>
            {weeks.map((week) => {
              const generated = isGenerated(week);
              const selected = selectedWeek === week;
              return (
                <TouchableOpacity
                  key={week}
                  style={[
                    styles.pill,
                    selected && styles.pillSelected,
                    !generated && styles.pillPending,
                  ]}
                  onPress={() => generated && setSelectedWeek(week)}
                  activeOpacity={generated ? 0.7 : 1}
                >
                  <Text
                    style={[
                      styles.pillText,
                      selected && styles.pillTextSelected,
                      !generated && styles.pillTextPending,
                    ]}
                  >
                    W{week}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>

      <ScrollView style={styles.sessionList} showsVerticalScrollIndicator={false}>
        {weekSessions.length > 0 ? (
          weekSessions.map((session) => (
            <SessionCard
              key={session.id}
              sport={session.sport}
              duration_minutes={session.duration_minutes}
              zone={session.zone}
              zone_label={session.zone_label}
              description={session.description}
              distance_yards={session.distance_yards}
            />
          ))
        ) : (
          <View style={styles.centered}>
            <Text style={styles.errorText}>
              {isGenerated(selectedWeek)
                ? "No sessions this week."
                : "This block hasn't been generated yet."}
            </Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  centered: {
    flex: 1,
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
  buildingBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.darkGray,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.xl,
  },
  buildingText: {
    fontSize: FONT_SIZES.xs,
    color: colors.primary,
    fontWeight: "600",
  },
  errorText: {
    fontSize: FONT_SIZES.md,
    color: colors.lightGray,
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
    backgroundColor: colors.mediumGray,
  },
  pillSelected: {
    backgroundColor: colors.primary,
  },
  pillPending: {
    opacity: 0.35,
  },
  pillText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: colors.lightGray,
  },
  pillTextSelected: {
    color: colors.background,
  },
  pillTextPending: {
    color: colors.lightGray,
  },
  sessionList: {
    flex: 1,
  },
});
