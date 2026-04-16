import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

function RouteGuard() {
  const { session, loading } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;

    const inTabs = segments[0] === "(tabs)";
    const inOnboarding = segments[0] === "onboarding";
    const inLogin = segments[0] === "login";

    if (!session) {
      if (!inLogin) router.replace("/login");
      return;
    }

    if (inOnboarding) return;

    const checkProfile = async () => {
      try {
        const { data, error } = await supabase
          .from("athlete_profiles")
          .select("user_id")
          .eq("user_id", session.user.id)
          .limit(1);

        if (error) {
          if (!inTabs) router.replace("/(tabs)/plan");
          return;
        }

        if (data && data.length > 0) {
          if (!inTabs) router.replace("/(tabs)/plan");
        } else {
          router.replace("/onboarding/goal");
        }
      } catch {
        if (!inTabs) router.replace("/(tabs)/plan");
      }
    };

    checkProfile();
  }, [session, loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return null;
}

function AppContent() {
  const { colors, isDark } = useTheme();
  return (
    <>
      <RouteGuard />
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
