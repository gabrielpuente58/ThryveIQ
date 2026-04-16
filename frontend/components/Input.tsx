import React from "react";
import { TextInput, StyleSheet, View, TextInputProps } from "react-native";
import { ThemeColors, SPACING, BORDER_RADIUS, FONT_SIZES } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";

interface InputProps extends TextInputProps {
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ icon, style, ...props }) => {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.container}>
      {icon && <View style={styles.iconContainer}>{icon}</View>}
      <TextInput
        style={[styles.input, icon && styles.inputWithIcon, style]}
        placeholderTextColor={colors.lightGray}
        {...props}
      />
    </View>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    position: "relative",
  },
  input: {
    backgroundColor: colors.mediumGray,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: colors.white,
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
