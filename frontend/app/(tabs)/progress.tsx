import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { API_URL } from "../../constants/api";
import { ThemeColors, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
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

interface ChartPoint {
  x: number;
  swim: number;
  bike: number;
  run: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get("window").width;

const SPORT_COLORS = {
  swim: "#3B82F6",
  bike: "#22C55E",
  run: "#F97316",
} as const;

const CHART_HEIGHT = 180;
const CHART_WIDTH = SCREEN_WIDTH - 64; // card horizontal padding

// ── Pure-RN line chart ────────────────────────────────────────────────────────

type LineDataKey = "swim" | "bike" | "run";

function toChartCoords(
  points: ChartPoint[],
  key: LineDataKey,
  maxY: number,
  w: number,
  h: number,
) {
  return points.map((p, i) => ({
    x: points.length < 2 ? w / 2 : (i / (points.length - 1)) * w,
    y: h - (p[key] / maxY) * h,
  }));
}

function Polyline({
  pts,
  color,
  strokeWidth = 2.5,
}: {
  pts: { x: number; y: number }[];
  color: string;
  strokeWidth?: number;
}) {
  const segments: React.ReactElement[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const x1 = pts[i].x;
    const y1 = pts[i].y;
    const x2 = pts[i + 1].x;
    const y2 = pts[i + 1].y;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    segments.push(
      <View
        key={i}
        style={{
          position: "absolute",
          left: x1,
          top: y1 - strokeWidth / 2,
          width: len,
          height: strokeWidth,
          backgroundColor: color,
          borderRadius: strokeWidth / 2,
          transform: [
            { translateX: len / 2 },
            { rotate: `${angle}deg` },
            { translateX: -(len / 2) },
          ],
        }}
      />,
    );
  }
  // dots at each point
  pts.forEach((pt, i) => {
    segments.push(
      <View
        key={`dot-${i}`}
        style={{
          position: "absolute",
          left: pt.x - strokeWidth,
          top: pt.y - strokeWidth,
          width: strokeWidth * 2,
          height: strokeWidth * 2,
          borderRadius: strokeWidth,
          backgroundColor: color,
        }}
      />,
    );
  });
  return <>{segments}</>;
}

function LineChart({
  chartData,
  maxHours,
  colors,
}: {
  chartData: ChartPoint[];
  maxHours: number;
  colors: ThemeColors;
}) {
  const w = CHART_WIDTH;
  const h = CHART_HEIGHT;
  const maxY = maxHours * 1.15;

  const swimPts = toChartCoords(chartData, "swim", maxY, w, h);
  const bikePts = toChartCoords(chartData, "bike", maxY, w, h);
  const runPts  = toChartCoords(chartData, "run",  maxY, w, h);

  // y-axis gridlines at 0, 50%, 100%
  const gridLines = [0, 0.5, 1].map((pct) => {
    const y = h - pct * h;
    return (
      <View
        key={pct}
        style={{
          position: "absolute",
          left: 0,
          top: y,
          width: w,
          height: 1,
          backgroundColor: colors.darkGray,
        }}
      />
    );
  });

  return (
    <View style={{ width: w, height: h, position: "relative" }}>
      {gridLines}
      <Polyline pts={swimPts} color={SPORT_COLORS.swim} />
      <Polyline pts={bikePts} color={SPORT_COLORS.bike} />
      <Polyline pts={runPts}  color={SPORT_COLORS.run}  />
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ label, colors }: { label: string; colors: ThemeColors }) {
  return (
    <Text
      style={{
        fontSize: FONT_SIZES.xs,
        fontWeight: "600",
        color: colors.lightGray,
        textTransform: "uppercase",
        letterSpacing: 0.8,
        marginTop: SPACING.lg,
        marginBottom: SPACING.sm,
        marginHorizontal: SPACING.md,
      }}
    >
      {label}
    </Text>
  );
}

function ChartLegend({ colors }: { colors: ThemeColors }) {
  return (
    <View style={legend.row}>
      {(["Swim", "Bike", "Run"] as const).map((name) => (
        <View key={name} style={legend.item}>
          <View style={[legend.dot, { backgroundColor: SPORT_COLORS[name.toLowerCase() as keyof typeof SPORT_COLORS] }]} />
          <Text style={[legend.label, { color: colors.lightGray }]}>{name}</Text>
        </View>
      ))}
    </View>
  );
}

function WeekLabels({ weeks, colors }: { weeks: WeeklyVolume[]; colors: ThemeColors }) {
  return (
    <View style={xlabels.row}>
      {weeks.map((w, i) => (
        <Text
          key={i}
          style={[xlabels.label, { color: colors.lightGray, width: (SCREEN_WIDTH - 64) / weeks.length }]}
          numberOfLines={1}
        >
          {w.week_label}
        </Text>
      ))}
    </View>
  );
}

function SportBreakdownRow({ name, pct, color, colors }: { name: string; pct: number; color: string; colors: ThemeColors }) {
  return (
    <View style={breakdown.row}>
      <View style={[breakdown.dot, { backgroundColor: color }]} />
      <Text style={[breakdown.name, { color: colors.white }]}>{name}</Text>
      <Text style={[breakdown.pct, { color: colors.lightGray }]}>{pct}%</Text>
      <View style={[breakdown.track, { backgroundColor: colors.darkGray }]}>
        <View style={[breakdown.fill, { width: `${pct}%` as `${number}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function StatCard({ label, value, colors }: { label: string; value: string; colors: ThemeColors }) {
  return (
    <View style={[stat.card, { backgroundColor: colors.mediumGray }]}>
      <Text style={[stat.value, { color: colors.primary }]}>{value}</Text>
      <Text style={[stat.label, { color: colors.lightGray }]}>{label}</Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);

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
      } catch {
        setError("Failed to load training data. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    fetchInsights();
  }, [user?.id]);

  const totalHours = data?.weekly_volumes.reduce((sum, w) => sum + w.total_hours, 0) ?? 0;
  const totalMiles = data?.weekly_volumes.reduce((sum, w) => sum + w.total_miles, 0) ?? 0;

  if (loading) {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
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
          <Button title="Go to Profile" onPress={() => router.push("/(tabs)/profile")} />
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

  const chartData: ChartPoint[] = data.weekly_volumes.map((w, i) => ({
    x: i,
    swim: w.swim_hours,
    bike: w.bike_hours,
    run: w.run_hours,
  }));

  const maxHours = Math.max(...data.weekly_volumes.map((w) => w.total_hours), 1);

  return (
    <Screen style={styles.screenOverride}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Progress</Text>
          <Text style={styles.subtitle}>Last 8 weeks</Text>
        </View>

        <SectionLabel label="Weekly Training Hours" colors={colors} />
        <Card style={styles.chartCard}>
          <ChartLegend colors={colors} />
          <View style={{ marginTop: SPACING.sm }}>
            <LineChart chartData={chartData} maxHours={maxHours} colors={colors} />
          </View>
          <WeekLabels weeks={data.weekly_volumes} colors={colors} />
        </Card>

        <SectionLabel label="Volume by Sport" colors={colors} />
        <Card style={styles.section}>
          <SportBreakdownRow name="Swim" pct={data.sport_breakdown.swim_pct} color={SPORT_COLORS.swim} colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.darkGray }]} />
          <SportBreakdownRow name="Bike" pct={data.sport_breakdown.bike_pct} color={SPORT_COLORS.bike} colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.darkGray }]} />
          <SportBreakdownRow name="Run"  pct={data.sport_breakdown.run_pct}  color={SPORT_COLORS.run}  colors={colors} />
        </Card>

        <SectionLabel label="Summary" colors={colors} />
        <View style={styles.statsRow}>
          <StatCard label="Activities"  value={String(data.total_activities)} colors={colors} />
          <StatCard label="Total Hours" value={totalHours.toFixed(1)}          colors={colors} />
          <StatCard label="Total Miles" value={totalMiles.toFixed(1)}          colors={colors} />
        </View>
      </ScrollView>
    </Screen>
  );
}

// ── Inline chart sub-styles ───────────────────────────────────────────────────

const legend = StyleSheet.create({
  row: { flexDirection: "row", gap: SPACING.lg, paddingHorizontal: SPACING.xs },
  item: { flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: FONT_SIZES.xs, fontWeight: "500" },
});

const xlabels = StyleSheet.create({
  row: { flexDirection: "row", marginTop: SPACING.sm },
  label: { fontSize: 9, textAlign: "center" },
});

const breakdown = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: SPACING.sm },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: SPACING.sm },
  name: { fontSize: FONT_SIZES.sm, width: 36 },
  pct: { fontSize: FONT_SIZES.sm, width: 36, textAlign: "right", marginRight: SPACING.sm },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
});

const stat = StyleSheet.create({
  card: { flex: 1, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, alignItems: "center" },
  value: { fontSize: FONT_SIZES.xl, fontWeight: "700" },
  label: { fontSize: FONT_SIZES.xs, marginTop: SPACING.xs, textAlign: "center" },
});

// ── Main styles factory ───────────────────────────────────────────────────────

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screenOverride: { padding: 0 },
    scrollContent: { paddingBottom: SPACING.xl },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: SPACING.lg,
    },
    header: {
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.xs,
    },
    title: {
      fontSize: FONT_SIZES.xxl,
      fontWeight: "700",
      color: colors.white,
    },
    subtitle: {
      fontSize: FONT_SIZES.sm,
      color: colors.lightGray,
      marginTop: SPACING.xs,
    },
    chartCard: {
      marginHorizontal: SPACING.md,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.sm,
      paddingHorizontal: SPACING.sm,
    },
    section: {
      marginHorizontal: SPACING.md,
    },
    divider: {
      height: 1,
      marginVertical: 0,
    },
    statsRow: {
      flexDirection: "row",
      gap: SPACING.sm,
      marginHorizontal: SPACING.md,
    },
    connectCard: {
      marginHorizontal: SPACING.md,
      marginTop: SPACING.lg,
      gap: SPACING.md,
    },
    connectTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: "700",
      color: colors.white,
    },
    connectBody: {
      fontSize: FONT_SIZES.sm,
      color: colors.lightGray,
      lineHeight: 20,
    },
    emptyText: {
      fontSize: FONT_SIZES.md,
      color: colors.lightGray,
      textAlign: "center",
      lineHeight: 24,
    },
    errorText: {
      fontSize: FONT_SIZES.md,
      color: colors.accent,
      textAlign: "center",
      lineHeight: 24,
    },
  });
