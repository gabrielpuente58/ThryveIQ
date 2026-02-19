import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from "../constants/theme";

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

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.mediumGray,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  selectedCard: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.darkGray,
  },
  label: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.white,
  },
  selectedLabel: {
    color: COLORS.primary,
  },
  description: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.lightGray,
    marginTop: SPACING.xs,
  },
  selectedDescription: {
    color: COLORS.lightGray,
  },
});
