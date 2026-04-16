import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { ThemeColors, SPACING, BORDER_RADIUS, FONT_SIZES } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";

interface OptionCardProps {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
}

export const OptionCard: React.FC<OptionCardProps> = ({
  label,
  description,
  selected,
  onPress,
}) => {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.selectedCard]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.label, selected && styles.selectedLabel]}>
        {label}
      </Text>
      {description && (
        <Text style={[styles.description, selected && styles.selectedDescription]}>
          {description}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: colors.mediumGray,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  selectedCard: {
    borderColor: colors.primary,
    backgroundColor: colors.darkGray,
  },
  label: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: colors.white,
  },
  selectedLabel: {
    color: colors.primary,
  },
  description: {
    fontSize: FONT_SIZES.sm,
    color: colors.lightGray,
    marginTop: SPACING.xs,
  },
  selectedDescription: {
    color: colors.lightGray,
  },
});
