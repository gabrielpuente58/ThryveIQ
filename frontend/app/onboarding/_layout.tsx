import { Stack } from "expo-router";
import { OnboardingProvider } from "../../context/OnboardingContext";

export default function OnboardingLayout() {
  return (
    <OnboardingProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#131321" },
          animation: "slide_from_right",
        }}
      />
    </OnboardingProvider>
  );
}
