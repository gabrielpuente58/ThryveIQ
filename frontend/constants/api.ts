import Constants from "expo-constants";
import { Platform } from "react-native";

function getApiUrl(): string {
  if (!__DEV__) {
    return "http://localhost:8000";
  }

  // On simulator, localhost works. On physical device, we need the LAN IP.
  // Expo's hostUri gives us the dev server's LAN IP (e.g. "192.168.1.5:8081")
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const lanIp = hostUri.split(":")[0];
    return `http://${lanIp}:8000`;
  }

  return "http://localhost:8000";
}

export const API_URL = getApiUrl();
