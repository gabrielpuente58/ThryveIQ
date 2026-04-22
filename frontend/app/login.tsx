import { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { ThemeColors, SPACING, FONT_SIZES, BORDER_RADIUS } from "../constants/theme";
import { supabase } from "../lib/supabase";
import { useTheme } from "../context/ThemeContext";

type Mode = "signin" | "signup";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

export default function LoginScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [focused, setFocused] = useState<"email" | "password" | "confirm" | null>(null);
  const [resetSending, setResetSending] = useState(false);

  const isSignUp = mode === "signup";

  const passwordStrength = useMemo(() => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= MIN_PASSWORD) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  }, [password]);

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setError(null);
    setInfo(null);
    setConfirm("");
  };

  const validate = (): string | null => {
    if (!email.trim() || !password) return "Enter your email and password.";
    if (!EMAIL_RE.test(email.trim())) return "That email doesn't look right.";
    if (isSignUp) {
      if (password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
      if (password !== confirm) return "Passwords don't match.";
    }
    return null;
  };

  const handleSubmit = async () => {
    setError(null);
    setInfo(null);
    const issue = validate();
    if (issue) {
      setError(issue);
      return;
    }
    setLoading(true);
    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setInfo("Check your inbox to confirm your email, then log in.");
          setMode("signin");
          setPassword("");
          setConfirm("");
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication failed.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim() || !EMAIL_RE.test(email.trim())) {
      setError("Enter your email above first to receive a reset link.");
      return;
    }
    setResetSending(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (resetError) throw resetError;
      setInfo("Password reset email sent. Check your inbox.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not send reset email.");
    } finally {
      setResetSending(false);
    }
  };

  const inputBorder = (field: "email" | "password" | "confirm") =>
    focused === field ? { borderColor: colors.primary } : { borderColor: "transparent" };

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brand}>
            <View style={styles.brandIcon}>
              <Ionicons name="pulse" size={28} color={colors.background} />
            </View>
            <Text style={styles.title}>ThryveIQ</Text>
            <Text style={styles.tagline}>AI-powered triathlon coaching</Text>
          </View>

          <View style={styles.segmented}>
            <TouchableOpacity
              style={[styles.segment, !isSignUp && styles.segmentActive]}
              onPress={() => switchMode("signin")}
              activeOpacity={0.85}
            >
              <Text style={[styles.segmentText, !isSignUp && styles.segmentTextActive]}>
                Log In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segment, isSignUp && styles.segmentActive]}
              onPress={() => switchMode("signup")}
              activeOpacity={0.85}
            >
              <Text style={[styles.segmentText, isSignUp && styles.segmentTextActive]}>
                Sign Up
              </Text>
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={styles.banner}>
              <Ionicons name="alert-circle" size={18} color={colors.background} />
              <Text style={styles.bannerText}>{error}</Text>
            </View>
          ) : null}

          {info ? (
            <View style={[styles.banner, styles.bannerInfo]}>
              <Ionicons name="checkmark-circle" size={18} color={colors.background} />
              <Text style={styles.bannerText}>{info}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <View style={[styles.inputWrap, inputBorder("email")]}>
              <Ionicons name="mail-outline" size={20} color={colors.lightGray} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={colors.lightGray}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                textContentType="emailAddress"
                style={styles.input}
                onFocus={() => setFocused("email")}
                onBlur={() => setFocused(null)}
                returnKeyType="next"
              />
            </View>

            <View style={[styles.inputWrap, inputBorder("password")]}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.lightGray} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={colors.lightGray}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                textContentType={isSignUp ? "newPassword" : "password"}
                style={styles.input}
                onFocus={() => setFocused("password")}
                onBlur={() => setFocused(null)}
                returnKeyType={isSignUp ? "next" : "go"}
                onSubmitEditing={isSignUp ? undefined : handleSubmit}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={10}
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={colors.lightGray}
                />
              </TouchableOpacity>
            </View>

            {isSignUp && password.length > 0 ? (
              <View style={styles.strengthRow}>
                {[0, 1, 2, 3].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.strengthBar,
                      {
                        backgroundColor:
                          i < passwordStrength
                            ? strengthColor(passwordStrength, colors)
                            : colors.darkGray,
                      },
                    ]}
                  />
                ))}
                <Text style={styles.strengthLabel}>{strengthLabel(passwordStrength)}</Text>
              </View>
            ) : null}

            {isSignUp ? (
              <View style={[styles.inputWrap, inputBorder("confirm")]}>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.lightGray} />
                <TextInput
                  value={confirm}
                  onChangeText={setConfirm}
                  placeholder="Confirm password"
                  placeholderTextColor={colors.lightGray}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  textContentType="newPassword"
                  style={styles.input}
                  onFocus={() => setFocused("confirm")}
                  onBlur={() => setFocused(null)}
                  returnKeyType="go"
                  onSubmitEditing={handleSubmit}
                />
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.submit, loading && styles.submitDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <>
                  <Text style={styles.submitText}>{isSignUp ? "Create account" : "Log in"}</Text>
                  <Ionicons name="arrow-forward" size={18} color={colors.background} />
                </>
              )}
            </TouchableOpacity>

            {!isSignUp ? (
              <TouchableOpacity
                onPress={handleForgotPassword}
                disabled={resetSending}
                style={styles.forgotWrap}
              >
                <Text style={styles.forgotText}>
                  {resetSending ? "Sending reset link…" : "Forgot password?"}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.disclaimer}>
                By creating an account you agree to use ThryveIQ for personal training only.
              </Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function strengthColor(score: number, colors: ThemeColors): string {
  if (score >= 4) return "#22C55E";
  if (score === 3) return colors.primary;
  if (score === 2) return "#EAB308";
  return "#EF4444";
}

function strengthLabel(score: number): string {
  if (score >= 4) return "Strong";
  if (score === 3) return "Good";
  if (score === 2) return "Fair";
  if (score === 1) return "Weak";
  return "";
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { padding: 0 },
    flex: { flex: 1 },
    scroll: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.xl,
      gap: SPACING.lg,
    },

    brand: { alignItems: "center", gap: SPACING.sm, marginBottom: SPACING.sm },
    brandIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.xs,
    },
    title: {
      fontSize: FONT_SIZES.xxl,
      fontWeight: "800",
      color: colors.white,
      letterSpacing: -0.5,
    },
    tagline: {
      fontSize: FONT_SIZES.sm,
      color: colors.lightGray,
      fontWeight: "500",
    },

    segmented: {
      flexDirection: "row",
      backgroundColor: colors.darkGray,
      borderRadius: BORDER_RADIUS.md,
      padding: 4,
      gap: 4,
    },
    segment: {
      flex: 1,
      paddingVertical: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.sm,
      alignItems: "center",
    },
    segmentActive: {
      backgroundColor: colors.mediumGray,
    },
    segmentText: {
      fontSize: FONT_SIZES.sm,
      color: colors.lightGray,
      fontWeight: "600",
    },
    segmentTextActive: {
      color: colors.white,
    },

    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
      backgroundColor: "#EF4444",
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.sm,
    },
    bannerInfo: { backgroundColor: colors.primary },
    bannerText: {
      flex: 1,
      color: colors.background,
      fontSize: FONT_SIZES.sm,
      fontWeight: "600",
    },

    form: { gap: SPACING.md },

    inputWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
      backgroundColor: colors.mediumGray,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: SPACING.md,
      borderWidth: 1.5,
      minHeight: 52,
    },
    input: {
      flex: 1,
      paddingVertical: SPACING.md,
      fontSize: FONT_SIZES.md,
      color: colors.white,
    },

    strengthRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: -SPACING.xs,
    },
    strengthBar: {
      flex: 1,
      height: 4,
      borderRadius: 2,
    },
    strengthLabel: {
      fontSize: FONT_SIZES.xs,
      color: colors.lightGray,
      fontWeight: "600",
      marginLeft: SPACING.xs,
      width: 50,
      textAlign: "right",
    },

    submit: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: SPACING.sm,
      backgroundColor: colors.primary,
      paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.md,
      minHeight: 52,
      marginTop: SPACING.xs,
    },
    submitDisabled: { opacity: 0.7 },
    submitText: {
      fontSize: FONT_SIZES.md,
      fontWeight: "700",
      color: colors.background,
    },

    forgotWrap: { alignItems: "center", paddingVertical: SPACING.xs },
    forgotText: {
      fontSize: FONT_SIZES.sm,
      color: colors.primary,
      fontWeight: "600",
    },
    disclaimer: {
      fontSize: FONT_SIZES.xs,
      color: colors.lightGray,
      textAlign: "center",
      marginTop: SPACING.xs,
      lineHeight: 16,
    },
  });
