export type ActivityMode = "running" | "walking" | "commute";
export type LegacyActivityMode = ActivityMode | "everyday";

export type CommuteMode = "walking" | "transit" | "bicycle" | "car";

export type CommuteInput = {
  mode: CommuteMode;
  outdoorMinutes: number;
  canCarryLayer: boolean;
};

export type StarterProfile = "standard" | "always-cold" | "heat-sensitive";
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

export const clothingItems = [
  "shorts",
  "long_pants",
  "t_shirt",
  "long_sleeve",
  "hoodie",
  "light_jacket",
  "rain_jacket",
  "gloves",
  "hat",
] as const satisfies readonly ClothingItem[];

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
  commute?: CommuteInput;
};

export type ComfortContextKey =
  | `running:${RunningIntensity}`
  | "walking"
  | `commute:${CommuteMode}`;

export type ComfortContextStats = {
  offsetC: number;
  outcomes: number;
  good: number;
  tooCold: number;
  tooWarm: number;
};

export type ComfortMemory = Partial<Record<ComfortContextKey, ComfortContextStats>>;

export type PersonalizationInput = {
  starterProfile: StarterProfile;
  ratedRecommendations: number;
  temperatureOffsetC?: number;
  comfortMemory?: ComfortMemory;
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

export type PersonalizationSignal = {
  label: string;
  value: string;
  impact: "warmer" | "lighter" | "neutral";
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
  profileSignals: PersonalizationSignal[];
};

export type OutfitVariantKind = "lighter" | "standard" | "warmer";

export type OutfitVariant = {
  id: string;
  kind: OutfitVariantKind;
  outfit: ClothingItem[];
  running?: RunningRecommendation;
  requiredItems: ClothingItem[];
  modelScore?: number;
};

export type RecommendationSource = "rules" | "model";

export type RecommendationResult = {
  source: RecommendationSource;
  engineVersion: string;
  safetyPolicyVersion: string;
  modelVersion?: string;
  recommendationId?: string;
  selectedVariantId: string;
  variants: OutfitVariant[];
  recommendation: Recommendation;
};

export type RecommendationConstraints = {
  thermalBias?: "lighter" | "warmer";
  avoidedItems?: ClothingItem[];
  canCarryLayer?: boolean;
};

export type RecommendationRequest = {
  clientRequestId: string;
  input: RecommendationInput;
  constraints?: RecommendationConstraints;
};

export type FeedbackAdjustment =
  | "none"
  | "added_layer"
  | "removed_layer"
  | "changed_top"
  | "changed_bottom"
  | "did_not_follow";

export type FeedbackProblemArea =
  | "upper"
  | "lower"
  | "hands_head"
  | "start"
  | "during"
  | "return";

export type ActuallyWorn = "yes" | "with_changes" | "no";

export type FeedbackSubmission = {
  rating: FeedbackRating;
  actuallyWorn: ActuallyWorn;
  adjustment: FeedbackAdjustment;
  problemAreas: FeedbackProblemArea[];
  source: "web" | "mobile";
};

export type FollowUpIntent =
  | "why_outfit"
  | "overheating"
  | "rain_wind"
  | "return_conditions"
  | "carry_layer"
  | "indoor_outdoor"
  | "adjust_warmer"
  | "adjust_lighter"
  | "avoid_item"
  | "item_question"
  | "out_of_scope";

export function normalizeActivityMode(value: unknown): ActivityMode {
  if (value === "running" || value === "walking" || value === "commute") {
    return value;
  }

  return value === "everyday" ? "commute" : "walking";
}
