import React, { createContext, useContext, useState } from "react";

export interface OnboardingData {
  goal?: "first_timer" | "recreational" | "competitive";
  race_date?: string;
  experience?: "first_timer" | "recreational" | "competitive";
  current_background?: string;
  weekly_hours?: number;
  days_available?: number;
  strongest_discipline?: "swim" | "bike" | "run";
  weakest_discipline?: "swim" | "bike" | "run";
}

interface OnboardingContextType {
  data: OnboardingData;
  update: (fields: Partial<OnboardingData>) => void;
  reset: () => void;
  testMode: boolean;
  setTestMode: (v: boolean) => void;
}

const OnboardingContext = createContext<OnboardingContextType>({
  data: {},
  update: () => {},
  reset: () => {},
  testMode: false,
  setTestMode: () => {},
});

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<OnboardingData>({});
  const [testMode, setTestMode] = useState(false);

  const update = (fields: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...fields }));
  };

  const reset = () => setData({});

  return (
    <OnboardingContext.Provider value={{ data, update, reset, testMode, setTestMode }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export const useOnboarding = () => useContext(OnboardingContext);
