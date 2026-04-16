import React from "react";
import { View, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { ThemeColors, SPACING, BORDER_RADIUS } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const Card: React.FC<CardProps> = ({ children, style }) => {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return <View style={[styles.card, style]}>{children}</View>;
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: colors.mediumGray,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
});
