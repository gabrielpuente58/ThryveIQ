import React, { useEffect, useRef, useState } from "react";
import { Modal, View, Text, StyleSheet, Animated, Easing } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { ThemeColors, SPACING, FONT_SIZES, BORDER_RADIUS } from "../constants/theme";

const STATUS_MESSAGES = [
  "Analyzing your fitness benchmarks…",
  "Designing your training phases…",
  "Building week-by-week workouts…",
  "Assigning zones and interval structures…",
  "Finalizing your personalized plan…",
];

interface Props {
  visible: boolean;
}

export const PlanBuildingOverlay: React.FC<Props> = ({ visible }) => {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const [messageIndex, setMessageIndex] = useState(0);
  const ringSpin = useRef(new Animated.Value(0)).current;
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (!visible) return;

    const spin = Animated.loop(
      Animated.timing(ringSpin, {
        toValue: 1,
        duration: 1800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    const makeDotAnim = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(value, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ]),
      );

    const dotAnims = [makeDotAnim(dot1, 0), makeDotAnim(dot2, 150), makeDotAnim(dot3, 300)];

    spin.start();
    dotAnims.forEach((a) => a.start());

    const rotator = setInterval(() => {
      setMessageIndex((i) => (i + 1) % STATUS_MESSAGES.length);
    }, 3500);

    return () => {
      spin.stop();
      dotAnims.forEach((a) => a.stop());
      clearInterval(rotator);
    };
  }, [visible, ringSpin, dot1, dot2, dot3]);

  const spinInterpolate = ringSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Modal visible={visible} animationType="fade" transparent={false}>
      <View style={styles.container}>
        <View style={styles.ringWrapper}>
          <Animated.View
            style={[styles.ring, { transform: [{ rotate: spinInterpolate }] }]}
          />
          <View style={styles.ringCore} />
        </View>

        <Text style={styles.title}>Building your plan</Text>
        <Text style={styles.subtitle}>This takes about a minute.</Text>

        <View style={styles.statusRow}>
          <Text style={styles.statusText}>{STATUS_MESSAGES[messageIndex]}</Text>
        </View>

        <View style={styles.dotsRow}>
          <Animated.View style={[styles.dot, { opacity: dot1 }]} />
          <Animated.View style={[styles.dot, { opacity: dot2 }]} />
          <Animated.View style={[styles.dot, { opacity: dot3 }]} />
        </View>
      </View>
    </Modal>
  );
};

const RING_SIZE = 88;
const RING_BORDER = 4;

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: "center",
      justifyContent: "center",
      padding: SPACING.xl,
    },
    ringWrapper: {
      width: RING_SIZE,
      height: RING_SIZE,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.xl,
    },
    ring: {
      position: "absolute",
      width: RING_SIZE,
      height: RING_SIZE,
      borderRadius: RING_SIZE / 2,
      borderWidth: RING_BORDER,
      borderColor: colors.darkGray,
      borderTopColor: colors.primary,
    },
    ringCore: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.primary,
    },
    title: {
      fontSize: FONT_SIZES.xxl,
      fontWeight: "bold",
      color: colors.white,
      marginBottom: SPACING.sm,
      textAlign: "center",
    },
    subtitle: {
      fontSize: FONT_SIZES.md,
      color: colors.lightGray,
      marginBottom: SPACING.xl,
      textAlign: "center",
    },
    statusRow: {
      minHeight: 48,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      backgroundColor: colors.mediumGray,
      borderRadius: BORDER_RADIUS.md,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.lg,
    },
    statusText: {
      fontSize: FONT_SIZES.sm,
      color: colors.white,
      textAlign: "center",
    },
    dotsRow: {
      flexDirection: "row",
      gap: 8,
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.primary,
    },
  });
