import React, { createContext, useContext, useState } from "react";

export interface OnboardingData {
  race_date?: string;
  hours_min?: number;
  hours_max?: number;
  days_available?: number;
  ftp?: number;
  lthr?: number;
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
