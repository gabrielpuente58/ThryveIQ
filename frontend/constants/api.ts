import Constants from "expo-constants";

function getApiUrl(): string {
  // Explicit override in .env takes priority (works on physical devices)
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) return envUrl;

  if (!__DEV__) {
    return "http://localhost:8000";
  }

  // In dev, derive LAN IP from Expo's hostUri so simulator also works
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const lanIp = hostUri.split(":")[0];
    return `http://${lanIp}:8000`;
  }

  return "http://localhost:8000";
}

export const API_URL = getApiUrl();
