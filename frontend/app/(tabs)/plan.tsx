import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
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

interface WorkoutDetail {
  session_id: string;
  warmup: string;
  main_set: string;
  cooldown: string;
  zone_ranges: Record<string, string>;
  coaching_notes: string;
}

interface AthleteProfile {
  goal: string;
  experience: string;
  strongest_discipline: string;
  weakest_discipline: string;
}

const WorkoutSection = ({ title, content }: { title: string; content: string }) => (
  <View style={styles.workoutSection}>
    <Text style={styles.workoutSectionTitle}>{title}</Text>
    <Text style={styles.workoutSectionContent}>{content}</Text>
  </View>
);

const ZoneRanges = ({ ranges }: { ranges: Record<string, string> }) => (
  <View style={styles.zoneRangesCard}>
    <Text style={styles.zoneRangesTitle}>Zone Targets</Text>
    <View style={styles.zoneRangesGrid}>
      {Object.entries(ranges).map(([key, value]) => (
        <View key={key} style={styles.zoneRangeItem}>
          <Text style={styles.zoneRangeKey}>{key.toUpperCase()}</Text>
          <Text style={styles.zoneRangeValue}>{value}</Text>
        </View>
      ))}
    </View>
  </View>
);

export default function PlanScreen() {
  const { user } = useAuth();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<AthleteProfile | null>(null);

  const [expandedSession, setExpandedSession] = useState<WorkoutDetail | null>(null);
  const [expandLoading, setExpandLoading] = useState(false);
  const [expandError, setExpandError] = useState<string | null>(null);
  const [expandModalVisible, setExpandModalVisible] = useState(false);

  const fetchPlan = async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API_URL}/plans/current?user_id=${user.id}`);
      if (!res.ok) throw new Error("No plan found");
      const data: Plan = await res.json();
      setPlan(data);
      setError(null);

      const profileRes = await fetch(`${API_URL}/profiles/${user.id}`);
      if (profileRes.ok) {
        const profileData: AthleteProfile = await profileRes.json();
        setProfile(profileData);
      }
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

  const expandSession = async (sessionId: string) => {
    if (!user) return;
    setExpandLoading(true);
    setExpandError(null);
    setExpandedSession(null);
    setExpandModalVisible(true);
    try {
      const res = await fetch(`${API_URL}/plans/session/${sessionId}/expand`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          zones: {},
          athlete_profile: {
            goal: profile?.goal ?? "recreational",
            experience: profile?.experience ?? "recreational",
            strongest_discipline: profile?.strongest_discipline ?? "bike",
            weakest_discipline: profile?.weakest_discipline ?? "swim",
          },
        }),
      });
      if (!res.ok) throw new Error("Failed to expand session");
      const data: WorkoutDetail = await res.json();
      setExpandedSession(data);
    } catch {
      setExpandError("Could not load workout details. Try again.");
    } finally {
      setExpandLoading(false);
    }
  };

  const closeExpandModal = () => {
    setExpandModalVisible(false);
    setExpandedSession(null);
    setExpandError(null);
  };

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
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

  const totalMinutes = weekSessions.reduce((sum, s) => sum + s.duration_minutes, 0);
  const totalHours = (totalMinutes / 60).toFixed(1);
  const disciplineMinutes: Record<string, number> = { swim: 0, bike: 0, run: 0 };
  weekSessions.forEach((s) => {
    if (s.sport in disciplineMinutes) disciplineMinutes[s.sport] += s.duration_minutes;
  });
  const disciplines = [
    { key: "swim", label: "Swim", color: "#3B82F6" },
    { key: "bike", label: "Bike", color: "#22C55E" },
    { key: "run", label: "Run", color: "#F97316" },
  ];

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

      <View style={styles.summaryCard}>
        <View style={styles.summaryTotal}>
          <Text style={styles.summaryTotalValue}>{totalHours}h</Text>
          <Text style={styles.summaryTotalLabel}>this week</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryDisciplines}>
          {disciplines.map(({ key, label, color }) => (
            <View key={key} style={styles.disciplineItem}>
              <View style={[styles.disciplineDot, { backgroundColor: color }]} />
              <Text style={styles.disciplineLabel}>{label}</Text>
              <Text style={styles.disciplineValue}>
                {(disciplineMinutes[key] / 60).toFixed(1)}h
              </Text>
            </View>
          ))}
        </View>
      </View>

      <ScrollView style={styles.sessionList} showsVerticalScrollIndicator={false}>
        {Object.entries(sessionsByDay).map(([day, sessions]) => (
          <DayCard key={day} day={day} sessions={sessions} onPressSession={expandSession} />
        ))}
      </ScrollView>

      <Modal
        visible={expandModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={closeExpandModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Workout Detail</Text>
              <TouchableOpacity onPress={closeExpandModal}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {expandLoading ? (
              <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
            ) : expandError ? (
              <Text style={styles.expandError}>{expandError}</Text>
            ) : expandedSession ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <WorkoutSection title="Warm-up" content={expandedSession.warmup} />
                <WorkoutSection title="Main Set" content={expandedSession.main_set} />
                <WorkoutSection title="Cool-down" content={expandedSession.cooldown} />
                <ZoneRanges ranges={expandedSession.zone_ranges} />
                <View style={styles.coachingCard}>
                  <Text style={styles.coachingLabel}>Coach's Note</Text>
                  <Text style={styles.coachingText}>{expandedSession.coaching_notes}</Text>
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
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
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.mediumGray,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  summaryTotal: {
    alignItems: "center",
    minWidth: 56,
  },
  summaryTotalValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.primary,
  },
  summaryTotalLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.lightGray,
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: COLORS.darkGray,
    marginHorizontal: SPACING.md,
  },
  summaryDisciplines: {
    flex: 1,
    gap: SPACING.xs,
  },
  disciplineItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  disciplineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  disciplineLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.lightGray,
    flex: 1,
  },
  disciplineValue: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.white,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.lg,
  },
  modalTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "bold",
    color: COLORS.white,
  },
  modalClose: {
    fontSize: 18,
    color: COLORS.lightGray,
    padding: SPACING.sm,
  },
  workoutSection: {
    backgroundColor: COLORS.mediumGray,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  workoutSectionTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "700",
    color: COLORS.primary,
    marginBottom: SPACING.xs,
  },
  workoutSectionContent: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.white,
    lineHeight: 22,
  },
  zoneRangesCard: {
    backgroundColor: COLORS.mediumGray,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  zoneRangesTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "700",
    color: COLORS.primary,
    marginBottom: SPACING.sm,
  },
  zoneRangesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  zoneRangeItem: {
    backgroundColor: COLORS.darkGray,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    minWidth: "45%",
  },
  zoneRangeKey: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.lightGray,
    marginBottom: 2,
  },
  zoneRangeValue: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.white,
  },
  coachingCard: {
    backgroundColor: COLORS.mediumGray,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  coachingLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primary,
    fontWeight: "700",
    marginBottom: SPACING.xs,
  },
  coachingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.white,
    lineHeight: 22,
  },
  expandError: {
    color: COLORS.lightGray,
    textAlign: "center",
    marginTop: SPACING.xl,
  },
});
