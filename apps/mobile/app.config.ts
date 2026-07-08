import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "ShortsAI",
  slug: "shorts-ai",
  scheme: "shortsai",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  platforms: ["ios"],
  plugins: ["expo-secure-store"],
  ios: {
    supportsTablet: false,
    bundleIdentifier: "app.shortsai.beta",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSLocationWhenInUseUsageDescription:
        "ShortsAI uses your location to load the local forecast for outfit planning.",
    },
  },
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  },
};

export default config;
