import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Canvas, Path, Skia } from "@shopify/react-native-skia";
import { Card } from "./Card";
import { useTheme } from "../context/ThemeContext";
import { ThemeColors, SPACING, FONT_SIZES, BORDER_RADIUS } from "../constants/theme";

interface SessionLike {
  sport: string;
  duration_minutes: number;
  zone: number;
  day?: string;
}

interface Props {
  weekIndex: number;
  phaseName?: string;
  phaseFocus?: string;
  sessions: SessionLike[];
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const DAY_ABBR: Record<string, string> = {
  Monday: "M", Tuesday: "T", Wednesday: "W",
  Thursday: "T", Friday: "F", Saturday: "S", Sunday: "S",
};

const SPORT_COLORS: Record<string, string> = { swim: "#3B82F6", bike: "#22C55E", run: "#F97316" };
const SPORT_LABELS: Record<string, string> = { swim: "Swim", bike: "Bike", run: "Run" };
const SPORTS = ["swim", "bike", "run"] as const;

const ZONE_COLORS: Record<number, string> = {
  1: "#6B7280",
  2: "#22C55E",
  3: "#EAB308",
  4: "#F97316",
  5: "#EF4444",
};

type IntensityBucket = "easy" | "moderate" | "hard";

const BUCKET_FOR_ZONE: Record<number, IntensityBucket> = {
  1: "easy", 2: "easy", 3: "moderate", 4: "hard", 5: "hard",
};

const BUCKET_COLORS: Record<IntensityBucket, string> = {
  easy: "#22C55E",
  moderate: "#EAB308",
  hard: "#EF4444",
};

const BUCKET_LABELS: Record<IntensityBucket, string> = {
  easy: "Easy",
  moderate: "Mod",
  hard: "Hard",
};

// ── Donut chart ───────────────────────────────────────────────────────────────

const DONUT_SIZE = 110;
const DONUT_STROKE = 14;

interface DonutSegment {
  value: number;
  color: string;
}

function SportDonut({ segments, trackColor }: { segments: DonutSegment[]; trackColor: string }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const cx = DONUT_SIZE / 2;
  const cy = DONUT_SIZE / 2;
  const r = (DONUT_SIZE - DONUT_STROKE) / 2;

  // Background track (full ring)
  const trackPath = Skia.Path.Make();
  trackPath.addCircle(cx, cy, r);

  const paths: { path: ReturnType<typeof Skia.Path.Make>; color: string }[] = [];

  if (total > 0) {
    let startAngle = -90; // top
    for (const seg of segments) {
      if (seg.value <= 0) continue;
      const sweep = (seg.value / total) * 360;
      const path = Skia.Path.Make();
      path.addArc(
        { x: cx - r, y: cy - r, width: r * 2, height: r * 2 },
        startAngle,
        sweep,
      );
      paths.push({ path, color: seg.color });
      startAngle += sweep;
    }
  }

  return (
    <Canvas style={{ width: DONUT_SIZE, height: DONUT_SIZE }}>
      <Path
        path={trackPath}
        color={trackColor}
        style="stroke"
        strokeWidth={DONUT_STROKE}
      />
      {paths.map((p, i) => (
        <Path
          key={i}
          path={p.path}
          color={p.color}
          style="stroke"
          strokeWidth={DONUT_STROKE}
          strokeCap="butt"
        />
      ))}
    </Canvas>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

export const WeekSummaryCard: React.FC<Props> = ({ weekIndex, phaseName, phaseFocus, sessions }) => {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const totalMin = sessions.reduce((s, x) => s + x.duration_minutes, 0);
  const totalHours = totalMin / 60;

  // Sport totals (donut + labels)
  const bySport: Record<string, number> = { swim: 0, bike: 0, run: 0 };
  for (const s of sessions) bySport[s.sport] = (bySport[s.sport] ?? 0) + s.duration_minutes;

  const donutSegments: DonutSegment[] = SPORTS.map((sp) => ({
    value: bySport[sp] ?? 0,
    color: SPORT_COLORS[sp],
  }));

  // Intensity distribution
  const byBucket: Record<IntensityBucket, number> = { easy: 0, moderate: 0, hard: 0 };
  for (const s of sessions) {
    const bucket = BUCKET_FOR_ZONE[s.zone] ?? "easy";
    byBucket[bucket] += s.duration_minutes;
  }

  // Per-day rollup for mini dots strip
  const perDay: Record<string, { mins: number; hardestZone: number }> = {};
  for (const day of DAYS) perDay[day] = { mins: 0, hardestZone: 0 };
  for (const s of sessions) {
    if (!s.day || !perDay[s.day]) continue;
    perDay[s.day].mins += s.duration_minutes;
    if (s.zone > perDay[s.day].hardestZone) perDay[s.day].hardestZone = s.zone;
  }

  const hardestSession = [...sessions].sort((a, b) => b.zone - a.zone)[0];

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.weekLabel}>Week {weekIndex}</Text>
          {phaseName ? <Text style={styles.phaseName}>{phaseName} phase</Text> : null}
        </View>
      </View>

      {phaseFocus ? <Text style={styles.phaseFocus}>{phaseFocus}</Text> : null}

      {/* Donut + breakdown row */}
      <View style={styles.donutRow}>
        <View style={styles.donutWrap}>
          <SportDonut segments={donutSegments} trackColor={colors.darkGray} />
          <View style={styles.donutCenter} pointerEvents="none">
            <Text style={styles.donutHours}>{totalHours.toFixed(1)}</Text>
            <Text style={styles.donutHoursLabel}>hours</Text>
          </View>
        </View>

        <View style={styles.breakdownCol}>
          {SPORTS.map((sp) => {
            const mins = bySport[sp] ?? 0;
            const pct = totalMin > 0 ? Math.round((mins / totalMin) * 100) : 0;
            return (
              <View key={sp} style={styles.breakdownRow}>
                <View style={[styles.breakdownDot, { backgroundColor: SPORT_COLORS[sp] }]} />
                <Text style={styles.breakdownLabel}>{SPORT_LABELS[sp]}</Text>
                <Text style={styles.breakdownValue}>
                  {(mins / 60).toFixed(1)}h
                  <Text style={styles.breakdownPct}>  {pct}%</Text>
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Intensity distribution strip */}
      {totalMin > 0 && (
        <View style={styles.intensityWrap}>
          <View style={styles.intensityBar}>
            {(["easy", "moderate", "hard"] as IntensityBucket[]).map((bucket) => {
              const mins = byBucket[bucket];
              if (mins === 0) return null;
              return (
                <View
                  key={bucket}
                  style={{ flex: mins, backgroundColor: BUCKET_COLORS[bucket] }}
                />
              );
            })}
          </View>
          <View style={styles.intensityLegend}>
            {(["easy", "moderate", "hard"] as IntensityBucket[]).map((bucket) => {
              const pct = totalMin > 0 ? Math.round((byBucket[bucket] / totalMin) * 100) : 0;
              if (pct === 0) return null;
              return (
                <View key={bucket} style={styles.intensityLegendItem}>
                  <View style={[styles.intensityDot, { backgroundColor: BUCKET_COLORS[bucket] }]} />
                  <Text style={styles.intensityLegendText}>
                    {BUCKET_LABELS[bucket]} {pct}%
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Mini 7-day dot strip */}
      <View style={styles.dotsRow}>
        {DAYS.map((day) => {
          const { mins, hardestZone } = perDay[day];
          const isRest = mins === 0;
          return (
            <View key={day} style={styles.dotCol}>
              <View
                style={[
                  styles.dot,
                  isRest
                    ? { backgroundColor: colors.darkGray, width: 6, height: 6 }
                    : { backgroundColor: ZONE_COLORS[hardestZone] },
                ]}
              />
              <Text style={styles.dotDayLabel}>{DAY_ABBR[day]}</Text>
            </View>
          );
        })}
      </View>

      {hardestSession ? (
        <Text style={styles.keySession}>
          Key session: Z{hardestSession.zone} {hardestSession.sport}
        </Text>
      ) : null}
    </Card>
  );
};

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: { padding: SPACING.md, gap: SPACING.md, marginBottom: SPACING.md },
    headerRow: { flexDirection: "row", alignItems: "center" },
    weekLabel: { fontSize: FONT_SIZES.lg, fontWeight: "700", color: colors.white },
    phaseName: { fontSize: FONT_SIZES.xs, color: colors.lightGray, marginTop: 2 },
    phaseFocus: { fontSize: FONT_SIZES.sm, color: colors.lightGray, fontStyle: "italic" },

    // Donut row
    donutRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.lg,
    },
    donutWrap: {
      width: DONUT_SIZE,
      height: DONUT_SIZE,
      alignItems: "center",
      justifyContent: "center",
    },
    donutCenter: {
      position: "absolute",
      alignItems: "center",
      justifyContent: "center",
    },
    donutHours: {
      fontSize: 26,
      fontWeight: "800",
      color: colors.white,
      lineHeight: 30,
    },
    donutHoursLabel: {
      fontSize: 10,
      fontWeight: "600",
      color: colors.lightGray,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    breakdownCol: { flex: 1, gap: SPACING.sm, justifyContent: "center" },
    breakdownRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
    },
    breakdownDot: { width: 10, height: 10, borderRadius: 5 },
    breakdownLabel: {
      flex: 1,
      fontSize: FONT_SIZES.sm,
      color: colors.lightGray,
      fontWeight: "600",
    },
    breakdownValue: {
      fontSize: FONT_SIZES.sm,
      color: colors.white,
      fontWeight: "700",
    },
    breakdownPct: {
      fontSize: FONT_SIZES.xs,
      color: colors.lightGray,
      fontWeight: "500",
    },

    // Intensity strip
    intensityWrap: { gap: 6 },
    intensityBar: {
      flexDirection: "row",
      height: 8,
      borderRadius: 4,
      overflow: "hidden",
      backgroundColor: colors.darkGray,
    },
    intensityLegend: {
      flexDirection: "row",
      gap: SPACING.md,
      flexWrap: "wrap",
    },
    intensityLegendItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    intensityDot: { width: 8, height: 8, borderRadius: 4 },
    intensityLegendText: {
      fontSize: 11,
      color: colors.lightGray,
      fontWeight: "600",
    },

    // Mini dot strip
    dotsRow: {
      flexDirection: "row",
      gap: SPACING.xs,
      justifyContent: "space-between",
    },
    dotCol: { flex: 1, alignItems: "center", gap: 4 },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    dotDayLabel: {
      fontSize: 10,
      color: colors.lightGray,
      fontWeight: "600",
    },

    keySession: { fontSize: FONT_SIZES.xs, color: colors.lightGray },
  });
