export type ActivityMode = "running" | "walking" | "everyday";

export type StarterProfile =
  | "standard"
  | "always-cold"
  | "heat-sensitive"
  | "runner"
  | "commuter";

export type FeedbackRating = "good" | "too_cold" | "too_warm";

export type RunningIntensity = "easy" | "medium" | "hard";

export type ClothingItem =
  | "shorts"
  | "long_pants"
  | "t_shirt"
  | "long_sleeve"
  | "hoodie"
  | "light_jacket"
  | "rain_jacket"
  | "gloves"
  | "hat";

export type RiskWarningType =
  | "cold_later"
  | "rain_likely"
  | "strong_wind"
  | "overheating"
  | "low_visibility";

export type WeatherSnapshot = {
  temperatureC: number;
  feelsLikeC: number;
  windKph: number;
  humidityPercent: number;
  rainProbabilityPercent: number;
  uvIndex: number;
  time: string;
  locationLabel: string;
};

export type HourlyForecast = WeatherSnapshot;

export type ActivityInput = {
  mode: ActivityMode;
  startTime: string;
  durationMinutes: number;
  returnHomeTime: string;
  intensity?: RunningIntensity;
};

export type PersonalizationInput = {
  starterProfile: StarterProfile;
  ratedRecommendations: number;
  temperatureOffsetC?: number;
};

export type RecommendationInput = {
  current: WeatherSnapshot;
  activity: ActivityInput;
  forecastAtFinish: HourlyForecast;
  forecastAtReturn: HourlyForecast;
  personalization: PersonalizationInput;
};

export type RiskWarning = {
  type: RiskWarningType;
  severity: "low" | "medium" | "high";
  message: string;
};

export type RunningRecommendation = {
  warmUp: ClothingItem[];
  mainRun: ClothingItem[];
  postRun: ClothingItem[];
  carryExtraLayer: boolean;
  hydrationReminder: boolean;
  visibilityReminder: boolean;
};

export type Recommendation = {
  activityMode: ActivityMode;
  headline: string;
  outfit: ClothingItem[];
  running?: RunningRecommendation;
  confidenceScore: number;
  explanationFacts: string[];
  riskWarnings: RiskWarning[];
  personalizationStage: "starter_profile" | "early_learning" | "personalized";
};
