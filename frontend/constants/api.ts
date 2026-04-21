import Constants from "expo-constants";

function getApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) return envUrl;

  if (!__DEV__) {
    return "http://localhost:8000";
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const lanIp = hostUri.split(":")[0];
    return `http://${lanIp}:8000`;
  }

  return "http://localhost:8000";
}

export const API_URL = getApiUrl();
