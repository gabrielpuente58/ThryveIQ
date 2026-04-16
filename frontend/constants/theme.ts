export const darkColors = {
  primary: "#46F0D2",
  background: "#131321",
  accent: "#FBE2B4",
  white: "#FFFFFF",
  darkGray: "#1E1E2E",
  mediumGray: "#2A2A3C",
  lightGray: "#8B8B9E",
} as const;

export const lightColors = {
  primary: "#46F0D2",
  background: "#F2F2F7",
  accent: "#D4811E",
  white: "#1C1C1E",
  darkGray: "#E5E5EA",
  mediumGray: "#FFFFFF",
  lightGray: "#6E6E80",
} as const;

export type ThemeColors = typeof darkColors;

// Legacy export — prefer useTheme() hook
export const COLORS = darkColors;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const BORDER_RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

export const FONT_SIZES = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 24,
  xxl: 32,
};
