import React from "react";
import { View, Text, StyleSheet } from "react-native";
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
  1: "#6B7280", 2: "#22C55E", 3: "#EAB308", 4: "#F97316", 5: "#EF4444",
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

const RHYTHM_HEIGHT = 56;

export const WeekSummaryCard: React.FC<Props> = ({ weekIndex, phaseName, phaseFocus, sessions }) => {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const totalMin = sessions.reduce((s, x) => s + x.duration_minutes, 0);
  const totalHours = (totalMin / 60).toFixed(1);

  const bySport: Record<string, number> = { swim: 0, bike: 0, run: 0 };
  for (const s of sessions) bySport[s.sport] = (bySport[s.sport] ?? 0) + s.duration_minutes;

  const byBucket: Record<IntensityBucket, number> = { easy: 0, moderate: 0, hard: 0 };
  for (const s of sessions) {
    const bucket = BUCKET_FOR_ZONE[s.zone] ?? "easy";
    byBucket[bucket] += s.duration_minutes;
  }

  const perDay: Record<string, { mins: number; hardestZone: number }> = {};
  for (const day of DAYS) perDay[day] = { mins: 0, hardestZone: 0 };
  for (const s of sessions) {
    if (!s.day || !perDay[s.day]) continue;
    perDay[s.day].mins += s.duration_minutes;
    if (s.zone > perDay[s.day].hardestZone) perDay[s.day].hardestZone = s.zone;
  }
  const maxDayMins = Math.max(...DAYS.map((d) => perDay[d].mins), 60);

  const hardestSession = [...sessions].sort((a, b) => b.zone - a.zone)[0];

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.weekLabel}>Week {weekIndex}</Text>
          {phaseName ? <Text style={styles.phaseName}>{phaseName} phase</Text> : null}
        </View>
        <View style={styles.hoursChip}>
          <Text style={styles.hoursText}>{totalHours}h</Text>
        </View>
      </View>

      {phaseFocus ? <Text style={styles.phaseFocus}>{phaseFocus}</Text> : null}

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

      {/* Day rhythm strip */}
      <View style={styles.rhythmWrap}>
        {DAYS.map((day) => {
          const { mins, hardestZone } = perDay[day];
          const heightPct = mins > 0 ? Math.max(mins / maxDayMins, 0.18) : 0;
          const color = hardestZone > 0 ? ZONE_COLORS[hardestZone] : colors.darkGray;
          return (
            <View key={day} style={styles.rhythmCol}>
              <View style={styles.rhythmCell}>
                {mins > 0 ? (
                  <View
                    style={[
                      styles.rhythmPill,
                      { height: `${heightPct * 100}%`, backgroundColor: color },
                    ]}
                  >
                    <Text style={styles.rhythmZoneText}>Z{hardestZone}</Text>
                  </View>
                ) : (
                  <View style={styles.rhythmRest} />
                )}
              </View>
              <Text style={styles.rhythmDayLabel}>{DAY_ABBR[day]}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.sportRow}>
        {SPORTS.map((sp) => {
          const mins = bySport[sp] ?? 0;
          if (mins === 0) return null;
          return (
            <View key={sp} style={styles.sportChip}>
              <View style={[styles.sportDot, { backgroundColor: SPORT_COLORS[sp] }]} />
              <Text style={styles.sportChipText}>
                {SPORT_LABELS[sp]} {(mins / 60).toFixed(1)}h
              </Text>
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
    hoursChip: {
      backgroundColor: colors.darkGray,
      paddingVertical: SPACING.xs,
      paddingHorizontal: SPACING.sm,
      borderRadius: BORDER_RADIUS.xl,
    },
    hoursText: { fontSize: FONT_SIZES.sm, fontWeight: "700", color: colors.primary },

    intensityWrap: { gap: 6 },
    intensityBar: {
      flexDirection: "row",
      height: 10,
      borderRadius: 5,
      overflow: "hidden",
      backgroundColor: colors.darkGray,
    },
    intensityLegend: {
      flexDirection: "row",
      gap: SPACING.md,
      flexWrap: "wrap",
    },
    intensityLegendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
    intensityDot: { width: 8, height: 8, borderRadius: 4 },
    intensityLegendText: { fontSize: 11, color: colors.lightGray, fontWeight: "600" },

    rhythmWrap: {
      flexDirection: "row",
      gap: SPACING.xs,
      marginTop: SPACING.xs,
    },
    rhythmCol: { flex: 1, alignItems: "center", gap: 6 },
    rhythmCell: {
      width: "100%",
      height: RHYTHM_HEIGHT,
      justifyContent: "flex-end",
      alignItems: "center",
    },
    rhythmPill: {
      width: "100%",
      borderRadius: BORDER_RADIUS.sm,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 2,
    },
    rhythmZoneText: {
      fontSize: 10,
      fontWeight: "800",
      color: colors.background,
    },
    rhythmRest: {
      width: "100%",
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.darkGray,
    },
    rhythmDayLabel: { fontSize: 10, color: colors.lightGray, fontWeight: "600" },

    sportRow: { flexDirection: "row", gap: SPACING.sm, flexWrap: "wrap" },
    sportChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.darkGray,
    },
    sportDot: { width: 6, height: 6, borderRadius: 3 },
    sportChipText: { fontSize: FONT_SIZES.xs, color: colors.white, fontWeight: "600" },
    keySession: { fontSize: FONT_SIZES.xs, color: colors.lightGray },
  });
