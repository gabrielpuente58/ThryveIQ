import React from "react";
import { View, StyleSheet } from "react-native";
import { ThemeColors, BORDER_RADIUS } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";

interface ProgressBarProps {
  current: number;
  total: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ current, total }) => {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const progress = current / total;

  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${progress * 100}%` }]} />
    </View>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  track: {
    height: 4,
    backgroundColor: colors.mediumGray,
    borderRadius: BORDER_RADIUS.sm,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: BORDER_RADIUS.sm,
  },
});
