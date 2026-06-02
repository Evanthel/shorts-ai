import type { StarterProfile } from "@/types/domain";

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
  runner: {
    id: "runner",
    label: "Runner",
    temperatureOffsetC: 1,
    runningHeatOffsetC: 6,
    prefersExtraLayer: false,
  },
  commuter: {
    id: "commuter",
    label: "Commuter",
    temperatureOffsetC: -1,
    runningHeatOffsetC: 4,
    prefersExtraLayer: true,
  },
};

export function getPersonalizationStage(ratedRecommendations: number) {
  if (ratedRecommendations >= 15) {
    return "personalized";
  }

  if (ratedRecommendations >= 5) {
    return "early_learning";
  }

  return "starter_profile";
}
