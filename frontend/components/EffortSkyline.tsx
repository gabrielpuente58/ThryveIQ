import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Interval } from "./SessionCard";
import { useTheme } from "../context/ThemeContext";
import { ThemeColors, SPACING, FONT_SIZES, BORDER_RADIUS } from "../constants/theme";

const ZONE_COLORS: Record<number, string> = {
  1: "#6B7280",
  2: "#22C55E",
  3: "#EAB308",
  4: "#F97316",
  5: "#EF4444",
};

const ZONE_HEIGHT_PCT: Record<number, number> = {
  1: 25,
  2: 40,
  3: 60,
  4: 80,
  5: 100,
};

interface Props {
  intervals: Interval[];
  sport: string;
}

function intervalWorkMinutes(iv: Interval): number {
  if (iv.duration_minutes) return iv.duration_minutes;
  if (iv.distance_yards) return iv.distance_yards / 55;
  return 0;
}

type Segment = { kind: "work"; zone: number; weight: number } | { kind: "rest"; weight: number };

function flattenIntervals(intervals: Interval[]): Segment[] {
  const out: Segment[] = [];
  for (const iv of intervals) {
    const workMin = intervalWorkMinutes(iv);
    if (workMin <= 0) continue;
    const restMin = iv.rest_seconds > 0 ? iv.rest_seconds / 60 : 0;
    const reps = Math.max(1, iv.reps || 1);
    for (let r = 0; r < reps; r++) {
      out.push({ kind: "work", zone: iv.zone, weight: workMin });
      if (restMin > 0 && r < reps - 1) {
        out.push({ kind: "rest", weight: restMin });
      }
    }
  }
  return out;
}

export const EffortSkyline: React.FC<Props> = ({ intervals, sport }) => {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const segments = flattenIntervals(intervals);
  if (segments.length === 0) return null;

  const totalWeight = segments.reduce((s, seg) => s + seg.weight, 0);
  if (totalWeight <= 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.chart}>
        {segments.map((seg, idx) => {
          const widthPct = (seg.weight / totalWeight) * 100;
          if (seg.kind === "rest") {
            return (
              <View
                key={idx}
                style={{ width: `${widthPct}%`, height: "15%", backgroundColor: colors.darkGray }}
              />
            );
          }
          const heightPct = ZONE_HEIGHT_PCT[seg.zone] ?? 40;
          return (
            <View
              key={idx}
              style={{
                width: `${widthPct}%`,
                height: `${heightPct}%`,
                backgroundColor: ZONE_COLORS[seg.zone] ?? colors.primary,
              }}
            />
          );
        })}
      </View>
      <View style={styles.legendRow}>
        <Text style={styles.legendLabel}>Effort</Text>
        <View style={styles.zoneLegend}>
          {[1, 2, 3, 4, 5].map((z) => (
            <View key={z} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: ZONE_COLORS[z] }]} />
              <Text style={styles.legendText}>Z{z}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
};

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrap: { gap: 4, marginTop: SPACING.xs },
    chart: {
      flexDirection: "row",
      alignItems: "flex-end",
      height: 48,
      backgroundColor: colors.darkGray + "60",
      borderRadius: BORDER_RADIUS.sm,
      overflow: "hidden",
    },
    legendRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    legendLabel: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.lightGray,
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    zoneLegend: { flexDirection: "row", gap: SPACING.sm },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 2 },
    legendDot: { width: 6, height: 6, borderRadius: 3 },
    legendText: { fontSize: 9, color: colors.lightGray, fontWeight: "600" },
  });
