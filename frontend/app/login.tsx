import { useState } from "react";
import { View, Text, StyleSheet, Alert, TouchableOpacity } from "react-native";
import { Screen } from "../components/Screen";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { COLORS, SPACING, FONT_SIZES } from "../constants/theme";
import { supabase } from "../lib/supabase";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Error", "Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication failed.";
      Alert.alert("Error", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>ThryveIQ</Text>
        <Text style={styles.subtitle}>{isSignUp ? "Create your account" : "Welcome back"}</Text>

        <View style={styles.form}>
          <Input
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Input
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
          />
          <Button
            title={isSignUp ? "Sign Up" : "Log In"}
            onPress={handleSubmit}
            loading={loading}
          />
        </View>

        <TouchableOpacity onPress={() => setIsSignUp((v) => !v)}>
          <Text style={styles.toggleText}>
            {isSignUp ? "Already have an account? " : "Don't have an account? "}
            <Text style={styles.toggleLink}>{isSignUp ? "Log In" : "Sign Up"}</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
  },
  content: {
    gap: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.xxl + 8,
    fontWeight: "bold",
    color: COLORS.primary,
    textAlign: "center",
  },
  subtitle: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.white,
    textAlign: "center",
    marginBottom: SPACING.sm,
  },
  form: {
    gap: SPACING.md,
  },
  toggleText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.lightGray,
    textAlign: "center",
  },
  toggleLink: {
    color: COLORS.primary,
    fontWeight: "600",
  },
});
