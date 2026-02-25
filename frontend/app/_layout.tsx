import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { COLORS } from "../constants/theme";

function RouteGuard() {
  const { session, loading } = useAuth();
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

    // Allow manual navigation to onboarding (e.g. test button from profile)
    if (inOnboarding) return;

    // Logged in — check profile via Supabase directly (works even when backend is down)
    const checkProfile = async () => {
      try {
        const { data, error } = await supabase
          .from("athlete_profiles")
          .select("user_id")
          .eq("user_id", session.user.id)
          .limit(1);

        if (error) {
          // RLS or network issue — can't determine profile status, go to tabs
          if (!inTabs) router.replace("/(tabs)/plan");
          return;
        }

        if (data && data.length > 0) {
          if (!inTabs) router.replace("/(tabs)/plan");
        } else {
          router.replace("/onboarding/goal");
        }
      } catch (e) {
        if (!inTabs) router.replace("/(tabs)/plan");
      }
    };

    checkProfile();
  }, [session, loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RouteGuard />
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#131321" },
          }}
        />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
