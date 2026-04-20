import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Card } from "./Card";
import { SessionCard } from "./SessionCard";
import { ThemeColors, SPACING, FONT_SIZES } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";

interface Session {
  id: string;
  sport: string;
  duration_minutes: number;
  zone: number;
  zone_label: string;
  description: string;
  distance_yards?: number | null;
}

interface DayCardProps {
  day: string;
  sessions: Session[];
  onPressSession?: (sessionId: string) => void;
}

export const DayCard: React.FC<DayCardProps> = ({ day, sessions, onPressSession }) => {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
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
            distance_yards={session.distance_yards}
            onPress={onPressSession ? () => onPressSession(session.id) : undefined}
          />
        </React.Fragment>
      ))}
    </Card>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    marginBottom: SPACING.sm,
    gap: SPACING.md,
  },
  day: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: colors.white,
  },
  divider: {
    height: 1,
    backgroundColor: colors.darkGray,
  },
});
