import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { API_URL } from "../constants/api";
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

    // Logged in — check if they have a profile
    const checkProfile = async () => {
      try {
        const res = await fetch(`${API_URL}/profiles/${session.user.id}`);
        if (res.ok) {
          if (!inTabs) router.replace("/(tabs)/plan");
        } else {
          if (!inOnboarding) router.replace("/onboarding/goal");
        }
      } catch {
        if (!inOnboarding) router.replace("/onboarding/goal");
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
