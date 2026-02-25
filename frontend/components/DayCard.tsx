import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Card } from "./Card";
import { SessionCard } from "./SessionCard";
import { COLORS, SPACING, FONT_SIZES } from "../constants/theme";

interface Session {
  id: string;
  sport: string;
  duration_minutes: number;
  zone: number;
  zone_label: string;
  description: string;
}

interface DayCardProps {
  day: string;
  sessions: Session[];
}

export const DayCard: React.FC<DayCardProps> = ({ day, sessions }) => {
  return (
    <Card style={styles.card}>
      <Text style={styles.day}>{day}</Text>
      {sessions.map((session, index) => (
        <React.Fragment key={session.id}>
          {index > 0 && <View style={styles.divider} />}
          <SessionCard
            sport={session.sport}
            duration_minutes={session.duration_minutes}
            zone={session.zone}
            zone_label={session.zone_label}
            description={session.description}
          />
        </React.Fragment>
      ))}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: SPACING.sm,
    gap: SPACING.md,
  },
  day: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.white,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.darkGray,
  },
});
