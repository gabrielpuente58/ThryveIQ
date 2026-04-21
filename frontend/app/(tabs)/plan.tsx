import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { SessionCard, Interval } from "../../components/SessionCard";
import { WeekSummaryCard } from "../../components/WeekSummaryCard";
import { FeedbackModal, WeekFeedback } from "../../components/FeedbackModal";
import { PlanBuildingOverlay } from "../../components/PlanBuildingOverlay";
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
  session_type?: string;
  description: string;
  distance_yards?: number | null;
  intervals?: Interval[];
}

interface Phase {
  name: string;
  weeks: number;
  start_week: number;
  end_week: number;
  focus?: string;
}

interface Plan {
  id: string;
  weeks_until_race: number;
  weeks_generated: number;
  phases: Phase[];
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
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loadPlan = useCallback(() => {
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
        setSelectedWeek((prev) => (prev <= (data.weeks_generated || 1) ? prev : data.weeks_generated || 1));
      })
      .catch(() => setError("No plan yet. Complete onboarding to generate one."))
      .finally(() => setLoading(false));
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadPlan();
    }, [loadPlan])
  );

  const handleSubmitFeedback = async (fb: WeekFeedback) => {
    if (!user || !plan) return;
    setFeedbackOpen(false);
    setGenerating(true);
    try {
      await fetch(`${API_URL}/plans/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          week_index: plan.weeks_generated,
          rpe: fb.rpe,
          went_well: fb.went_well,
          didnt_go_well: fb.didnt_go_well,
          notes: fb.notes,
        }),
      });

      const res = await fetch(`${API_URL}/plans/next-week`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt);
      }
      const updated: Plan = await res.json();
      setPlan(updated);
      setSelectedWeek(updated.weeks_generated);
    } catch (e: any) {
      Alert.alert("Couldn't build next week", String(e?.message ?? e));
    } finally {
      setGenerating(false);
    }
  };

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

  const weeksGenerated = plan.weeks_generated || 1;
  const canGenerateNext = weeksGenerated < plan.weeks_until_race;
  const weekPills = Array.from({ length: weeksGenerated }, (_, i) => i + 1);
  const weekSessions = plan.sessions.filter((s) => s.week === selectedWeek);
  const currentPhase = plan.phases?.find(
    (p) => selectedWeek >= p.start_week && selectedWeek <= p.end_week
  );

  const sessionsByDay = DAYS_ORDER.reduce<Record<string, Session[]>>((acc, day) => {
    const daySessions = weekSessions.filter((s) => s.day === day);
    if (daySessions.length > 0) acc[day] = daySessions;
    return acc;
  }, {});

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Training Plan</Text>
        <View style={styles.progressChip}>
          <Text style={styles.progressText}>
            {weeksGenerated}/{plan.weeks_until_race} weeks built
          </Text>
        </View>
      </View>

      <View style={styles.pillsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.pillsRow}>
            {weekPills.map((week) => (
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
            {canGenerateNext && (
              <View style={[styles.pill, styles.pillLocked]}>
                <Text style={styles.pillLockedText}>W{weeksGenerated + 1} +</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        <WeekSummaryCard
          weekIndex={selectedWeek}
          phaseName={currentPhase?.name}
          phaseFocus={currentPhase?.focus}
          sessions={weekSessions}
        />

        {Object.entries(sessionsByDay).map(([day, sessions]) => {
          const isBrick = sessions.length > 1;
          return (
            <View key={day} style={styles.dayGroup}>
              <View style={styles.dayHeaderRow}>
                <Text style={styles.dayLabel}>{day}</Text>
                {isBrick && (
                  <View style={styles.brickChip}>
                    <Text style={styles.brickChipText}>BRICK</Text>
                  </View>
                )}
              </View>
              {sessions.map((session, idx) => (
                <View
                  key={session.id}
                  style={[
                    styles.sessionWrapper,
                    isBrick && idx < sessions.length - 1 && styles.brickGap,
                  ]}
                >
                  <Card style={styles.sessionCard}>
                    <SessionCard
                      id={session.id}
                      sport={session.sport}
                      duration_minutes={session.duration_minutes}
                      zone={session.zone}
                      zone_label={session.zone_label}
                      session_type={session.session_type}
                      description={session.description}
                      distance_yards={session.distance_yards}
                      intervals={session.intervals}
                      day={session.day}
                      week={session.week}
                    />
                  </Card>
                  {isBrick && idx < sessions.length - 1 && (
                    <View style={styles.brickConnector} />
                  )}
                </View>
              ))}
            </View>
          );
        })}

        {weekSessions.length === 0 && (
          <Text style={styles.emptyText}>No sessions for this week.</Text>
        )}

        {canGenerateNext && selectedWeek === weeksGenerated && (
          <Card style={styles.nextWeekCard}>
            <Text style={styles.nextWeekTitle}>Ready for week {weeksGenerated + 1}?</Text>
            <Text style={styles.nextWeekSubtitle}>
              Log how this week went and the coach will shape the next one around it.
            </Text>
            <Button
              title="Build next week"
              onPress={() => setFeedbackOpen(true)}
              disabled={generating}
              loading={generating}
            />
          </Card>
        )}

        {!canGenerateNext && (
          <Card style={styles.nextWeekCard}>
            <Text style={styles.nextWeekTitle}>All weeks built</Text>
            <Text style={styles.nextWeekSubtitle}>
              You've built the full plan through race day.
            </Text>
          </Card>
        )}
      </ScrollView>

      <FeedbackModal
        visible={feedbackOpen}
        weekIndex={weeksGenerated}
        submitting={generating}
        onSubmit={handleSubmitFeedback}
        onClose={() => setFeedbackOpen(false)}
      />

      <PlanBuildingOverlay visible={generating} />
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
    progressChip: {
      backgroundColor: colors.darkGray,
      paddingVertical: SPACING.xs,
      paddingHorizontal: SPACING.sm,
      borderRadius: BORDER_RADIUS.xl,
    },
    progressText: { fontSize: FONT_SIZES.xs, fontWeight: "600", color: colors.primary },
    pillsContainer: { marginBottom: SPACING.md },
    pillsRow: { flexDirection: "row", gap: SPACING.sm },
    pill: {
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.mediumGray,
    },
    pillSelected: { backgroundColor: colors.primary },
    pillLocked: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: colors.darkGray,
      borderStyle: "dashed",
    },
    pillText: { fontSize: FONT_SIZES.sm, fontWeight: "600", color: colors.lightGray },
    pillTextSelected: { color: colors.background },
    pillLockedText: { fontSize: FONT_SIZES.sm, fontWeight: "600", color: colors.lightGray },
    list: { flex: 1 },
    dayGroup: { marginBottom: SPACING.lg },
    dayHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
      marginBottom: SPACING.sm,
    },
    dayLabel: {
      fontSize: FONT_SIZES.sm,
      fontWeight: "700",
      color: colors.lightGray,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    brickChip: {
      backgroundColor: colors.primary,
      paddingVertical: 2,
      paddingHorizontal: SPACING.sm,
      borderRadius: BORDER_RADIUS.sm,
    },
    brickChipText: {
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1,
      color: colors.background,
    },
    sessionWrapper: { position: "relative" },
    brickGap: { marginBottom: SPACING.md },
    brickConnector: {
      position: "absolute",
      left: SPACING.lg,
      bottom: -SPACING.md,
      width: 2,
      height: SPACING.md,
      backgroundColor: colors.primary,
      opacity: 0.5,
    },
    sessionCard: { padding: SPACING.md },
    emptyText: { fontSize: FONT_SIZES.md, color: colors.lightGray, textAlign: "center" },
    nextWeekCard: {
      padding: SPACING.md,
      gap: SPACING.sm,
      marginTop: SPACING.md,
      marginBottom: SPACING.xl,
    },
    nextWeekTitle: { fontSize: FONT_SIZES.lg, fontWeight: "700", color: colors.white },
    nextWeekSubtitle: { fontSize: FONT_SIZES.sm, color: colors.lightGray, lineHeight: 20 },
  });
