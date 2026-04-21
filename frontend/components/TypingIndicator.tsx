import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { ThemeColors, SPACING, BORDER_RADIUS } from "../constants/theme";
import { Card } from "./Card";

export const TypingIndicator: React.FC = () => {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const makeAnim = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(value, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ]),
      );

    const anims = [makeAnim(dot1, 0), makeAnim(dot2, 150), makeAnim(dot3, 300)];
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.wrapper}>
      <Card style={styles.bubble}>
        <View style={styles.row}>
          <Animated.View style={[styles.dot, { opacity: dot1 }]} />
          <Animated.View style={[styles.dot, { opacity: dot2 }]} />
          <Animated.View style={[styles.dot, { opacity: dot3 }]} />
        </View>
      </Card>
    </View>
  );
};

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrapper: {
      alignSelf: "flex-start",
      marginBottom: SPACING.md,
      maxWidth: "80%",
    },
    bubble: {
      backgroundColor: colors.mediumGray,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.md,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.lightGray,
    },
  });
