import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Card } from "./Card";
import { ThemeColors, SPACING, FONT_SIZES, BORDER_RADIUS } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";
import { setPendingWorkoutChat } from "../lib/workoutChatContext";

const SPORT_COLORS: Record<string, string> = {
  swim: "#3B82F6",
  bike: "#22C55E",
  run: "#F97316",
};

const SPORT_LABELS: Record<string, string> = {
  swim: "Swim",
  bike: "Bike",
  run: "Run",
};

export interface Interval {
  label: string;
  reps: number;
  duration_minutes: number | null;
  distance_yards: number | null;
  zone: number;
  metric: string;
  rest_seconds: number;
  notes: string;
}

export interface SessionCardProps {
  id?: string;
  sport: string;
  duration_minutes: number;
  zone: number;
  zone_label: string;
  description: string;
  distance_yards?: number | null;
  intervals?: Interval[];
  day?: string;
  week?: number;
  onPress?: () => void;
}

function formatVolume(interval: Interval): string {
  if (interval.distance_yards) return `${interval.distance_yards}yd`;
  if (interval.duration_minutes) return `${interval.duration_minutes}min`;
  return "";
}

function buildWorkoutContext(props: SessionCardProps): string {
  const vol = props.sport === "swim" && props.distance_yards
    ? `${props.distance_yards}yd`
    : `${props.duration_minutes}min`;

  let text = `Workout: ${SPORT_LABELS[props.sport] ?? props.sport} — Zone ${props.zone} (${props.zone_label}) — ${vol}\n`;
  if (props.day) text += `Day: ${props.day}\n`;
  text += `\nFocus: ${props.description}\n`;

  if (props.intervals && props.intervals.length > 0) {
    text += "\nStructure:\n";
    for (const iv of props.intervals) {
      const rep = iv.reps > 1 ? `${iv.reps} × ` : "";
      const vol2 = formatVolume(iv);
      const rest = iv.rest_seconds > 0 ? ` (${iv.rest_seconds}s rest)` : "";
      text += `• ${iv.label}: ${rep}${vol2} — ${iv.metric}${rest}\n`;
      if (iv.notes) text += `  ${iv.notes}\n`;
    }
  }
  return text;
}

export const SessionCard: React.FC<SessionCardProps> = (props) => {
  const {
    sport, duration_minutes, zone, zone_label, description,
    distance_yards, intervals = [], onPress,
  } = props;

  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const sportColor = SPORT_COLORS[sport] ?? colors.primary;

  const volumeLabel = sport === "swim" && distance_yards
    ? `${distance_yards}yd`
    : `${duration_minutes}min`;

  const handleAskCoach = () => {
    const context = buildWorkoutContext(props);
    const message = `Can you walk me through this ${SPORT_LABELS[sport] ?? sport} workout and give me tips for executing it well?`;
    setPendingWorkoutChat(message, context);
    router.navigate("/(tabs)/chat");
  };

  const inner = (
    <View style={styles.session}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={styles.left}>
          <View style={[styles.sportBadge, { backgroundColor: sportColor }]}>
            <Text style={styles.sportText}>{SPORT_LABELS[sport] ?? sport}</Text>
          </View>
          <Text style={styles.volume}>{volumeLabel}</Text>
        </View>
        <View style={styles.zoneBadge}>
          <Text style={styles.zoneText}>Z{zone} {zone_label}</Text>
        </View>
      </View>

      {/* Description */}
      <Text style={styles.description}>{description}</Text>

      {/* Interval toggle + Ask Coach row */}
      <View style={styles.actionsRow}>
        {intervals.length > 0 && (
          <TouchableOpacity
            style={styles.toggleBtn}
            onPress={() => setExpanded((v) => !v)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={14}
              color={colors.primary}
            />
            <Text style={[styles.toggleText, { color: colors.primary }]}>
              {expanded ? "Hide workout" : "Show workout"}
            </Text>
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.coachBtn} onPress={handleAskCoach} activeOpacity={0.7}>
          <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.background} />
          <Text style={styles.coachBtnText}>Ask Coach</Text>
        </TouchableOpacity>
      </View>

      {/* Interval list */}
      {expanded && intervals.length > 0 && (
        <View style={styles.intervalList}>
          {intervals.map((iv, idx) => {
            const vol2 = formatVolume(iv);
            const repLabel = iv.reps > 1 ? `${iv.reps} ×` : "";
            const restLabel = iv.rest_seconds > 0 ? ` · ${iv.rest_seconds}s rest` : "";
            const zColor = SPORT_COLORS[sport] ?? colors.primary;
            return (
              <View key={idx} style={styles.intervalRow}>
                <View style={[styles.intervalZoneDot, { backgroundColor: zColor + (iv.zone >= 4 ? "ff" : "99") }]} />
                <View style={styles.intervalContent}>
                  <View style={styles.intervalTopRow}>
                    <Text style={styles.intervalLabel}>
                      {repLabel ? `${repLabel} ${iv.label}` : iv.label}
                    </Text>
                    {vol2 ? <Text style={styles.intervalVol}>{vol2}{restLabel}</Text> : null}
                  </View>
                  <Text style={styles.intervalMetric}>{iv.metric}</Text>
                  {iv.notes ? <Text style={styles.intervalNotes}>{iv.notes}</Text> : null}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {onPress && !expanded && (
        <View style={styles.expandHint}>
          <Text style={styles.expandHintText}>Tap to expand ›</Text>
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
};

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    session: { gap: SPACING.sm },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    left: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
    sportBadge: {
      paddingVertical: SPACING.xs,
      paddingHorizontal: SPACING.sm,
      borderRadius: BORDER_RADIUS.sm,
    },
    sportText: { fontSize: FONT_SIZES.xs, fontWeight: "700", color: "#FFFFFF" },
    volume: { fontSize: FONT_SIZES.sm, fontWeight: "600", color: colors.white },
    zoneBadge: {
      backgroundColor: colors.darkGray,
      paddingVertical: 2,
      paddingHorizontal: SPACING.sm,
      borderRadius: BORDER_RADIUS.sm,
    },
    zoneText: { fontSize: FONT_SIZES.xs, color: colors.lightGray },
    description: {
      fontSize: FONT_SIZES.sm,
      color: colors.lightGray,
      lineHeight: 20,
    },
    actionsRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: SPACING.xs,
    },
    toggleBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingVertical: 4,
    },
    toggleText: { fontSize: FONT_SIZES.xs, fontWeight: "600" },
    coachBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.primary,
      paddingVertical: SPACING.xs,
      paddingHorizontal: SPACING.sm,
      borderRadius: BORDER_RADIUS.xl,
    },
    coachBtnText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: "700",
      color: colors.background,
    },
    intervalList: {
      marginTop: SPACING.xs,
      borderTopWidth: 1,
      borderTopColor: colors.darkGray,
      paddingTop: SPACING.sm,
      gap: SPACING.sm,
    },
    intervalRow: {
      flexDirection: "row",
      gap: SPACING.sm,
      alignItems: "flex-start",
    },
    intervalZoneDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginTop: 5,
      flexShrink: 0,
    },
    intervalContent: { flex: 1, gap: 2 },
    intervalTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    intervalLabel: {
      fontSize: FONT_SIZES.sm,
      fontWeight: "600",
      color: colors.white,
      flex: 1,
    },
    intervalVol: {
      fontSize: FONT_SIZES.xs,
      color: colors.lightGray,
      marginLeft: SPACING.sm,
    },
    intervalMetric: {
      fontSize: FONT_SIZES.xs,
      color: colors.lightGray,
    },
    intervalNotes: {
      fontSize: FONT_SIZES.xs,
      color: colors.mediumGray,
      fontStyle: "italic",
    },
    expandHint: { alignItems: "flex-end", marginTop: SPACING.xs },
    expandHintText: {
      fontSize: FONT_SIZES.xs,
      color: colors.primary,
      opacity: 0.8,
    },
  });
