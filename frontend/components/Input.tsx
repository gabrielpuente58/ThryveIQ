import React from "react";
import { TextInput, StyleSheet, View, TextInputProps } from "react-native";
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from "../constants/theme";

interface InputProps extends TextInputProps {
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ icon, style, ...props }) => {
  return (
    <View style={styles.container}>
      {icon && <View style={styles.iconContainer}>{icon}</View>}
      <TextInput
        style={[styles.input, icon && styles.inputWithIcon, style]}
        placeholderTextColor={COLORS.lightGray}
        {...props}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
  input: {
    backgroundColor: COLORS.mediumGray,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.white,
    minHeight: 50,
  },
  inputWithIcon: {
    paddingLeft: SPACING.xl + SPACING.lg,
  },
  iconContainer: {
    position: "absolute",
    left: SPACING.md,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    zIndex: 1,
  },
});
