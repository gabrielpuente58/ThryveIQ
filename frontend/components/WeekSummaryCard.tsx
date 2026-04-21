import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
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

const DONUT_SIZE = 116;
const DONUT_STROKE = 14;
const DONUT_RADIUS = (DONUT_SIZE - DONUT_STROKE) / 2;
const DONUT_CIRCUM = 2 * Math.PI * DONUT_RADIUS;

export const WeekSummaryCard: React.FC<Props> = ({ weekIndex, phaseName, phaseFocus, sessions }) => {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const totalMin = sessions.reduce((s, x) => s + x.duration_minutes, 0);
  const totalHours = (totalMin / 60).toFixed(1);

  const bySport: Record<string, number> = { swim: 0, bike: 0, run: 0 };
  for (const s of sessions) bySport[s.sport] = (bySport[s.sport] ?? 0) + s.duration_minutes;

  const perDay: Record<string, { mins: number; hardestZone: number }> = {};
  for (const day of DAYS) perDay[day] = { mins: 0, hardestZone: 0 };
  for (const s of sessions) {
    if (!s.day || !perDay[s.day]) continue;
    perDay[s.day].mins += s.duration_minutes;
    if (s.zone > perDay[s.day].hardestZone) perDay[s.day].hardestZone = s.zone;
  }

  const hardestSession = [...sessions].sort((a, b) => b.zone - a.zone)[0];

  // Build donut arc segments
  let cumulative = 0;
  const segments = SPORTS.map((sp) => {
    const mins = bySport[sp] ?? 0;
    const fraction = totalMin > 0 ? mins / totalMin : 0;
    const dasharray = `${DONUT_CIRCUM * fraction} ${DONUT_CIRCUM}`;
    const dashoffset = -DONUT_CIRCUM * cumulative;
    cumulative += fraction;
    return { sport: sp, mins, fraction, dasharray, dashoffset };
  });

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.weekLabel}>Week {weekIndex}</Text>
          {phaseName ? <Text style={styles.phaseName}>{phaseName} phase</Text> : null}
        </View>
      </View>

      {phaseFocus ? <Text style={styles.phaseFocus}>{phaseFocus}</Text> : null}

      {/* Donut + breakdown */}
      <View style={styles.donutRow}>
        <View style={styles.donutWrap}>
          <Svg width={DONUT_SIZE} height={DONUT_SIZE}>
            <G rotation="-90" originX={DONUT_SIZE / 2} originY={DONUT_SIZE / 2}>
              <Circle
                cx={DONUT_SIZE / 2}
                cy={DONUT_SIZE / 2}
                r={DONUT_RADIUS}
                stroke={colors.darkGray}
                strokeWidth={DONUT_STROKE}
                fill="none"
              />
              {totalMin > 0 &&
                segments.map((seg) =>
                  seg.fraction > 0 ? (
                    <Circle
                      key={seg.sport}
                      cx={DONUT_SIZE / 2}
                      cy={DONUT_SIZE / 2}
                      r={DONUT_RADIUS}
                      stroke={SPORT_COLORS[seg.sport]}
                      strokeWidth={DONUT_STROKE}
                      strokeDasharray={seg.dasharray}
                      strokeDashoffset={seg.dashoffset}
                      strokeLinecap="butt"
                      fill="none"
                    />
                  ) : null,
                )}
            </G>
          </Svg>
          <View style={styles.donutCenter}>
            <Text style={styles.donutHours}>{totalHours}</Text>
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
                </Text>
                <Text style={styles.breakdownPct}>{pct}%</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Day rhythm dots */}
      <View style={styles.dayRow}>
        {DAYS.map((day) => {
          const { mins, hardestZone } = perDay[day];
          const color = hardestZone > 0 ? ZONE_COLORS[hardestZone] : colors.darkGray;
          return (
            <View key={day} style={styles.dayCol}>
              <View
                style={[
                  styles.dayDot,
                  {
                    backgroundColor: mins > 0 ? color : "transparent",
                    borderColor: mins > 0 ? color : colors.darkGray,
                  },
                ]}
              >
                {mins > 0 ? <Text style={styles.dayDotText}>Z{hardestZone}</Text> : null}
              </View>
              <Text style={styles.dayLabel}>{DAY_ABBR[day]}</Text>
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
      fontSize: 24,
      fontWeight: "800",
      color: colors.white,
      lineHeight: 26,
    },
    donutHoursLabel: {
      fontSize: 10,
      color: colors.lightGray,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    breakdownCol: {
      flex: 1,
      gap: SPACING.sm,
    },
    breakdownRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
    },
    breakdownDot: { width: 10, height: 10, borderRadius: 5 },
    breakdownLabel: {
      fontSize: FONT_SIZES.sm,
      color: colors.white,
      fontWeight: "600",
      flex: 1,
    },
    breakdownValue: {
      fontSize: FONT_SIZES.sm,
      color: colors.white,
      fontWeight: "700",
    },
    breakdownPct: {
      fontSize: FONT_SIZES.xs,
      color: colors.lightGray,
      fontWeight: "600",
      width: 36,
      textAlign: "right",
    },

    dayRow: {
      flexDirection: "row",
      gap: SPACING.xs,
      marginTop: SPACING.xs,
    },
    dayCol: { flex: 1, alignItems: "center", gap: 6 },
    dayDot: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1.5,
      alignItems: "center",
      justifyContent: "center",
    },
    dayDotText: {
      fontSize: 9,
      fontWeight: "800",
      color: colors.background,
    },
    dayLabel: { fontSize: 10, color: colors.lightGray, fontWeight: "600" },

    keySession: { fontSize: FONT_SIZES.xs, color: colors.lightGray },
  });
