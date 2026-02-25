import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Card } from "./Card";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../constants/theme";

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

interface SessionCardProps {
  sport: string;
  duration_minutes: number;
  zone: number;
  zone_label: string;
  description: string;
}

export const SessionCard: React.FC<SessionCardProps> = ({
  sport,
  duration_minutes,
  zone,
  zone_label,
  description,
}) => {
  const sportColor = SPORT_COLORS[sport] ?? COLORS.primary;

  return (
    <View style={styles.session}>
      <View style={styles.header}>
        <View style={styles.left}>
          <View style={[styles.sportBadge, { backgroundColor: sportColor }]}>
            <Text style={styles.sportText}>{SPORT_LABELS[sport] ?? sport}</Text>
          </View>
          <Text style={styles.duration}>{duration_minutes}min</Text>
        </View>
        <View style={styles.zoneBadge}>
          <Text style={styles.zoneText}>Z{zone} {zone_label}</Text>
        </View>
      </View>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  session: {
    gap: SPACING.sm,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  sportBadge: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
  },
  sportText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "700",
    color: COLORS.white,
  },
  duration: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.white,
  },
  zoneBadge: {
    backgroundColor: COLORS.darkGray,
    paddingVertical: 2,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
  },
  zoneText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.lightGray,
  },
  description: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.lightGray,
    lineHeight: 20,
  },
});
