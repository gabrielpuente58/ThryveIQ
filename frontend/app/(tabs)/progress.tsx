import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import {
  VictoryChart,
  VictoryBar,
  VictoryAxis,
  VictoryTheme,
} from "victory-native";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { API_URL } from "../../constants/api";
import {
  COLORS,
  SPACING,
  FONT_SIZES,
  BORDER_RADIUS,
} from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WeeklyVolume {
  week_label: string;
  swim_hours: number;
  bike_hours: number;
  run_hours: number;
  total_hours: number;
  swim_miles: number;
  bike_miles: number;
  run_miles: number;
  total_miles: number;
}

interface SportBreakdown {
  swim_pct: number;
  bike_pct: number;
  run_pct: number;
}

interface StravaInsightsResponse {
  connected: boolean;
  weekly_volumes: WeeklyVolume[];
  sport_breakdown: SportBreakdown;
  total_activities: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CHART_WIDTH = Dimensions.get("window").width - 64;

const SPORT_COLORS = {
  swim: "#3B82F6",
  bike: "#22C55E",
  run: "#F97316",
} as const;

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

interface SportBreakdownRowProps {
  name: string;
  pct: number;
  color: string;
}

function SportBreakdownRow({ name, pct, color }: SportBreakdownRowProps) {
  return (
    <View style={styles.breakdownRow}>
      <View style={[styles.sportDot, { backgroundColor: color }]} />
      <Text style={styles.sportName}>{name}</Text>
      <Text style={styles.sportPct}>{pct}%</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%` as `${number}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

interface StatCardProps {
  label: string;
  value: string;
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StravaInsightsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    const fetchInsights = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_URL}/strava/insights?user_id=${user.id}`);
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const json = (await res.json()) as StravaInsightsResponse;
        setData(json);
      } catch (err) {
        setError("Failed to load training data. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchInsights();
  }, [user?.id]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const chartData =
    data?.weekly_volumes.map((w, i) => ({
      x: w.week_label,
      y: w.total_hours,
      index: i,
    })) ?? [];

  const totalHours =
    data?.weekly_volumes.reduce((sum, w) => sum + w.total_hours, 0) ?? 0;
  const totalMiles =
    data?.weekly_volumes.reduce((sum, w) => sum + w.total_miles, 0) ?? 0;

  // ── Render states ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </Screen>
    );
  }

  if (!data?.connected) {
    return (
      <Screen>
        <View style={styles.header}>
          <Text style={styles.title}>Progress</Text>
          <Text style={styles.subtitle}>Last 8 weeks</Text>
        </View>
        <Card style={styles.connectCard}>
          <Text style={styles.connectTitle}>Strava Not Connected</Text>
          <Text style={styles.connectBody}>
            Connect Strava in your Profile to see training data.
          </Text>
          <Button
            title="Go to Profile"
            onPress={() => router.push("/(tabs)/profile")}
          />
        </Card>
      </Screen>
    );
  }

  if (!data.weekly_volumes.length) {
    return (
      <Screen>
        <View style={styles.header}>
          <Text style={styles.title}>Progress</Text>
          <Text style={styles.subtitle}>Last 8 weeks</Text>
        </View>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            No training data yet. Complete some workouts on Strava!
          </Text>
        </View>
      </Screen>
    );
  }

  // ── Full render ─────────────────────────────────────────────────────────────

  return (
    <Screen style={styles.screenOverride}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Progress</Text>
          <Text style={styles.subtitle}>Last 8 weeks</Text>
        </View>

        {/* Section 2 — Weekly Hours Bar Chart */}
        <SectionLabel label="Weekly Training Hours" />
        <Card style={styles.chartCard}>
          <VictoryChart
            width={CHART_WIDTH}
            height={220}
            theme={VictoryTheme.material}
            domainPadding={{ x: 16 }}
            padding={{ top: 16, bottom: 48, left: 40, right: 16 }}
          >
            <VictoryAxis
              tickFormat={(t: string) => t}
              style={{
                axis: { stroke: COLORS.lightGray },
                tickLabels: {
                  fill: COLORS.lightGray,
                  fontSize: 10,
                  angle: -30,
                  textAnchor: "end",
                },
                grid: { stroke: "transparent" },
              }}
            />
            <VictoryAxis
              dependentAxis
              tickFormat={(t: number) => `${t}h`}
              style={{
                axis: { stroke: COLORS.lightGray },
                tickLabels: {
                  fill: COLORS.lightGray,
                  fontSize: 10,
                },
                grid: { stroke: COLORS.mediumGray, strokeDasharray: "4,4" },
              }}
            />
            <VictoryBar
              data={chartData}
              style={{
                data: {
                  fill: COLORS.primary,
                  opacity: 0.9,
                },
              }}
              cornerRadius={{ top: 4 }}
            />
          </VictoryChart>
        </Card>

        {/* Section 3 — Sport Breakdown */}
        <SectionLabel label="Volume by Sport" />
        <Card>
          <SportBreakdownRow
            name="Swim"
            pct={data.sport_breakdown.swim_pct}
            color={SPORT_COLORS.swim}
          />
          <SportBreakdownRow
            name="Bike"
            pct={data.sport_breakdown.bike_pct}
            color={SPORT_COLORS.bike}
          />
          <SportBreakdownRow
            name="Run"
            pct={data.sport_breakdown.run_pct}
            color={SPORT_COLORS.run}
          />
        </Card>

        {/* Section 4 — Summary Stats */}
        <SectionLabel label="Summary" />
        <View style={styles.statsRow}>
          <StatCard
            label="Activities"
            value={String(data.total_activities)}
          />
          <StatCard
            label="Total Hours"
            value={totalHours.toFixed(1)}
          />
          <StatCard
            label="Total Miles"
            value={totalMiles.toFixed(1)}
          />
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </Screen>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screenOverride: {
    padding: 0,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.lg,
  },
  header: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: "700",
    color: COLORS.white,
  },
  subtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.lightGray,
    marginTop: SPACING.xs,
  },
  sectionLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.lightGray,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
    marginHorizontal: SPACING.md,
  },
  chartCard: {
    marginHorizontal: SPACING.md,
    padding: SPACING.sm,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: COLORS.mediumGray,
  },
  // Sport breakdown
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.sm,
  },
  sportDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: SPACING.sm,
  },
  sportName: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.white,
    width: 36,
  },
  sportPct: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.lightGray,
    width: 36,
    textAlign: "right",
    marginRight: SPACING.sm,
  },
  barTrack: {
    flex: 1,
    height: 6,
    backgroundColor: COLORS.darkGray,
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  // Stats
  statsRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginHorizontal: SPACING.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.mediumGray,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    alignItems: "center",
  },
  statValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.primary,
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.lightGray,
    marginTop: SPACING.xs,
    textAlign: "center",
  },
  // Connect card
  connectCard: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.lg,
    gap: SPACING.md,
  },
  connectTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.white,
  },
  connectBody: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.lightGray,
    lineHeight: 20,
  },
  // Empty / error
  emptyText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.lightGray,
    textAlign: "center",
    lineHeight: 24,
  },
  errorText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.accent,
    textAlign: "center",
    lineHeight: 24,
  },
  bottomSpacer: {
    height: SPACING.xl,
  },
});
