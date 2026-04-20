import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
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
  total: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get("window").width;

const SPORT_COLORS = {
  swim: "#3B82F6",
  bike: "#22C55E",
  run: "#F97316",
  total: "#A78BFA",
} as const;

const CHART_HEIGHT = 180;

// ── Pure-RN line chart ────────────────────────────────────────────────────────

type LineDataKey = "swim" | "bike" | "run" | "total";

const SPORT_KEYS: LineDataKey[] = ["total", "swim", "bike", "run"];

function toCoords(
  points: ChartPoint[],
  key: LineDataKey,
  maxY: number,
  w: number,
  h: number,
) {
  const n = points.length;
  return points.map((p, i) => ({
    x: n < 2 ? w / 2 : (i / (n - 1)) * w,
    // clamp to avoid floating point below 0
    y: h - Math.max(0, (p[key] / maxY) * h),
  }));
}

function Polyline({
  pts,
  color,
  strokeWidth = 2.5,
  selectedIdx,
  onDotPress,
}: {
  pts: { x: number; y: number }[];
  color: string;
  strokeWidth?: number;
  selectedIdx: number | null;
  onDotPress: (index: number) => void;
}) {
  const elements: React.ReactElement[] = [];

  for (let i = 0; i < pts.length - 1; i++) {
    const { x: x1, y: y1 } = pts[i];
    const { x: x2, y: y2 } = pts[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.5) continue;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    elements.push(
      <View
        key={`s${i}`}
        style={{
          position: "absolute",
          left: mx - len / 2,
          top: my - strokeWidth / 2,
          width: len,
          height: strokeWidth,
          backgroundColor: color,
          borderRadius: strokeWidth / 2,
          transform: [{ rotate: `${angle}deg` }],
        }}
      />,
    );
  }

  pts.forEach((pt, i) => {
    const isSelected = selectedIdx === i;
    const r = isSelected ? strokeWidth + 3 : strokeWidth + 0.5;
    const hitR = 16; // large transparent hit area
    elements.push(
      <TouchableOpacity
        key={`d${i}`}
        onPress={() => onDotPress(i)}
        style={{
          position: "absolute",
          left: pt.x - hitR,
          top: pt.y - hitR,
          width: hitR * 2,
          height: hitR * 2,
          alignItems: "center",
          justifyContent: "center",
        }}
        activeOpacity={0.7}
      >
        <View
          style={{
            width: r * 2,
            height: r * 2,
            borderRadius: r,
            backgroundColor: color,
            borderWidth: isSelected ? 2 : 0,
            borderColor: "#FFFFFF",
          }}
        />
      </TouchableOpacity>,
    );
  });

  return <>{elements}</>;
}

const Y_AXIS_WIDTH = 36;
const TOOLTIP_WIDTH = 140;

type Selection = { idx: number; sport: LineDataKey } | null;

const SPORT_HOURS_KEY: Record<LineDataKey, keyof WeeklyVolume> = {
  swim: "swim_hours", bike: "bike_hours", run: "run_hours", total: "total_hours",
};
const SPORT_MILES_KEY: Record<LineDataKey, keyof WeeklyVolume> = {
  swim: "swim_miles", bike: "bike_miles", run: "run_miles", total: "total_miles",
};
const SPORT_LABEL: Record<LineDataKey, string> = {
  swim: "Swim", bike: "Bike", run: "Run", total: "Total",
};

function LineChart({
  chartData,
  weeklyData,
  maxHours,
  visible,
  colors,
}: {
  chartData: ChartPoint[];
  weeklyData: WeeklyVolume[];
  maxHours: number;
  visible: Record<LineDataKey, boolean>;
  colors: ThemeColors;
}) {
  const [w, setW] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);
  const h = CHART_HEIGHT;
  const maxY = maxHours * 1.15;
  const gridPcts = [0, 0.5, 1];
  const n = chartData.length;

  const xOf = (i: number) => (n < 2 ? w / 2 : (i / (n - 1)) * w);

  const tooltipLeft = (idx: number) => {
    const x = xOf(idx);
    return Math.min(Math.max(x - TOOLTIP_WIDTH / 2, 0), w - TOOLTIP_WIDTH);
  };

  const handleDotPress = (sport: LineDataKey, idx: number) => {
    setSelection((prev) =>
      prev?.idx === idx && prev?.sport === sport ? null : { idx, sport },
    );
  };

  const week = selection ? weeklyData[selection.idx] : null;
  const sportColor = selection ? SPORT_COLORS[selection.sport] : colors.primary;

  return (
    <View style={{ flexDirection: "row", height: h + 48 }}>
      {/* Y-axis labels */}
      <View style={{ width: Y_AXIS_WIDTH, height: h, justifyContent: "space-between", alignItems: "flex-end", paddingRight: SPACING.xs }}>
        {[...gridPcts].reverse().map((pct) => (
          <Text key={pct} style={{ fontSize: 9, color: colors.lightGray }}>
            {(maxY * pct).toFixed(1)}h
          </Text>
        ))}
      </View>

      {/* Chart canvas */}
      <View
        style={{ flex: 1 }}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
      >
        {w > 0 && (
          <View style={{ width: w, height: h, position: "relative" }}>
            {/* Gridlines */}
            {gridPcts.map((pct) => (
              <View
                key={pct}
                style={{
                  position: "absolute",
                  left: 0,
                  top: h - pct * h,
                  width: w,
                  height: 1,
                  backgroundColor: colors.darkGray,
                }}
              />
            ))}

            {/* Lines + tappable dots per sport */}
            {SPORT_KEYS.map((key) =>
              visible[key] ? (
                <Polyline
                  key={key}
                  pts={toCoords(chartData, key, maxY, w, h)}
                  color={SPORT_COLORS[key]}
                  selectedIdx={selection?.sport === key ? selection.idx : null}
                  onDotPress={(idx) => handleDotPress(key, idx)}
                />
              ) : null,
            )}

            {/* Selected column hairline */}
            {selection && (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: xOf(selection.idx) - 1,
                  top: 0,
                  width: 2,
                  height: h,
                  backgroundColor: sportColor + "50",
                }}
              />
            )}

            {/* Tooltip */}
            {week && selection && (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: -52,
                  left: tooltipLeft(selection.idx),
                  width: TOOLTIP_WIDTH,
                  backgroundColor: colors.mediumGray,
                  borderRadius: BORDER_RADIUS.sm,
                  borderWidth: 1,
                  borderColor: sportColor + "80",
                  paddingVertical: SPACING.xs,
                  paddingHorizontal: SPACING.sm,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.xs, marginBottom: 2 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: sportColor }} />
                  <Text style={{ fontSize: 9, color: colors.lightGray, fontWeight: "600" }}>
                    {SPORT_LABEL[selection.sport]} · {week.week_label}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 11, color: colors.white, fontWeight: "700" }}>
                    {(week[SPORT_HOURS_KEY[selection.sport]] as number).toFixed(1)}h
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.white, fontWeight: "700" }}>
                    {(week[SPORT_MILES_KEY[selection.sport]] as number).toFixed(1)} mi
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}
      </View>
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

function SportToggle({
  visible,
  onToggle,
  colors,
}: {
  visible: Record<LineDataKey, boolean>;
  onToggle: (key: LineDataKey) => void;
  colors: ThemeColors;
}) {
  return (
    <View style={toggle.row}>
      {SPORT_KEYS.map((key) => {
        const active = visible[key];
        const color = SPORT_COLORS[key];
        return (
          <TouchableOpacity
            key={key}
            onPress={() => onToggle(key)}
            style={[
              toggle.pill,
              { borderColor: color, backgroundColor: active ? color + "22" : "transparent" },
            ]}
            activeOpacity={0.7}
          >
            <View style={[toggle.dot, { backgroundColor: active ? color : colors.darkGray }]} />
            <Text style={[toggle.label, { color: active ? color : colors.lightGray }]}>
              {key === "total" ? "Total" : key.charAt(0).toUpperCase() + key.slice(1)}
            </Text>
          </TouchableOpacity>
        );
      })}
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
  const [visible, setVisible] = useState<Record<LineDataKey, boolean>>({
    total: true,
    swim: true,
    bike: true,
    run: true,
  });

  const toggleSport = (key: LineDataKey) =>
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }));

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
    total: w.total_hours,
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
          <SportToggle visible={visible} onToggle={toggleSport} colors={colors} />
          <View style={{ marginTop: SPACING.sm }}>
            <LineChart chartData={chartData} weeklyData={data.weekly_volumes} maxHours={maxHours} visible={visible} colors={colors} />
          </View>
          <WeekLabels weeks={data.weekly_volumes} colors={colors} />
        </Card>

        <SectionLabel label="Sport Mix (8-week total)" colors={colors} />
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

const toggle = StyleSheet.create({
  row: { flexDirection: "row", gap: SPACING.sm, paddingHorizontal: SPACING.xs },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
  },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  label: { fontSize: FONT_SIZES.xs, fontWeight: "600" },
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
