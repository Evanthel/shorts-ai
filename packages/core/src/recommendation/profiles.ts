import type { StarterProfile } from "../domain";

export type StarterProfileConfig = {
  id: StarterProfile;
  label: string;
  temperatureOffsetC: number;
  runningHeatOffsetC: number;
  prefersExtraLayer: boolean;
};

export const starterProfiles: Record<StarterProfile, StarterProfileConfig> = {
  standard: {
    id: "standard",
    label: "Standard",
    temperatureOffsetC: 0,
    runningHeatOffsetC: 4,
    prefersExtraLayer: false,
  },
  "always-cold": {
    id: "always-cold",
    label: "Always Cold",
    temperatureOffsetC: -3,
    runningHeatOffsetC: 3,
    prefersExtraLayer: true,
  },
  "heat-sensitive": {
    id: "heat-sensitive",
    label: "Heat Sensitive",
    temperatureOffsetC: 3,
    runningHeatOffsetC: 6,
    prefersExtraLayer: false,
  },
};

export function normalizeStarterProfile(value: unknown): StarterProfile {
  if (value === "always-cold" || value === "heat-sensitive" || value === "standard") {
    return value;
  }

  return "standard";
}

export function getPersonalizationStage(ratedRecommendations: number) {
  if (ratedRecommendations >= 15) {
    return "personalized";
  }

  if (ratedRecommendations >= 5) {
    return "early_learning";
  }

  return "starter_profile";
}
