import type {
  ClothingItem,
  RecommendationInput,
  RiskWarning,
} from "../domain";
import { getContextTemperatureOffset } from "../feedback";
import { starterProfiles } from "./profiles";

export const SAFETY_POLICY_VERSION = "shortsai-safety-v1";

export type SafetyPolicyResult = {
  requiredItems: ClothingItem[];
  warnings: RiskWarning[];
  checks: {
    cold: boolean;
    rain: boolean;
    wind: boolean;
    heat: boolean;
    lowVisibility: boolean;
  };
};

export function applySafetyPolicy(input: RecommendationInput): SafetyPolicyResult {
  const profile = starterProfiles[input.personalization.starterProfile];
  const contextOffset = getContextTemperatureOffset(
    input.activity,
    input.personalization.comfortMemory,
    input.personalization.temperatureOffsetC ?? 0,
  );
  const minFeelsLike = Math.min(
    input.current.feelsLikeC,
    input.forecastAtFinish.feelsLikeC,
    input.forecastAtReturn.feelsLikeC,
  ) + profile.temperatureOffsetC + contextOffset;
  const maxRain = Math.max(
    input.current.rainProbabilityPercent,
    input.forecastAtFinish.rainProbabilityPercent,
    input.forecastAtReturn.rainProbabilityPercent,
  );
  const maxWind = Math.max(
    input.current.windKph,
    input.forecastAtFinish.windKph,
    input.forecastAtReturn.windKph,
  );
  const maxTemperature = Math.max(
    input.current.temperatureC,
    input.forecastAtFinish.temperatureC,
    input.forecastAtReturn.temperatureC,
  );
  const cold = minFeelsLike < 12;
  const rain = maxRain >= 55;
  const wind = maxWind >= 25;
  const heat = maxTemperature >= 24;
  const lowVisibility = isLowVisibilityTime(input.activity.startTime);
  const requiredItems: ClothingItem[] = [];

  if (cold) requiredItems.push("light_jacket");
  if (minFeelsLike < 6) requiredItems.push("gloves", "hat");
  if (rain) requiredItems.push("rain_jacket");

  return {
    requiredItems: uniqueItems(requiredItems),
    warnings: buildWarnings(input, { cold, rain, wind, heat, lowVisibility }, maxRain, maxWind),
    checks: { cold, rain, wind, heat, lowVisibility },
  };
}

function buildWarnings(
  input: RecommendationInput,
  checks: SafetyPolicyResult["checks"],
  maxRain: number,
  maxWind: number,
): RiskWarning[] {
  const warnings: RiskWarning[] = [];
  const temperatureDrop = input.current.feelsLikeC - input.forecastAtReturn.feelsLikeC;

  if (temperatureDrop >= 4 || input.forecastAtReturn.feelsLikeC <= 10) {
    warnings.push({
      type: "cold_later",
      severity: temperatureDrop >= 7 ? "high" : "medium",
      message: "It will feel colder by the time you return home.",
    });
  }
  if (checks.rain) {
    warnings.push({
      type: "rain_likely",
      severity: maxRain >= 75 ? "high" : "medium",
      message: "Rain protection is required during this plan window.",
    });
  }
  if (checks.wind) {
    warnings.push({
      type: "strong_wind",
      severity: maxWind >= 35 ? "high" : "medium",
      message: "Wind may make the outfit feel colder than the raw temperature suggests.",
    });
  }
  if (
    checks.heat &&
    input.activity.mode === "running" &&
    (input.activity.intensity === "medium" || input.activity.intensity === "hard")
  ) {
    warnings.push({
      type: "overheating",
      severity: input.current.temperatureC >= 29 ? "high" : "medium",
      message: "The run may feel warmer once your body temperature rises.",
    });
  }
  if (checks.lowVisibility) {
    warnings.push({
      type: "low_visibility",
      severity: "low",
      message: "Choose visible or reflective clothing in low light.",
    });
  }

  return warnings;
}

function isLowVisibilityTime(value: string) {
  const hour = new Date(value).getHours();
  return hour < 7 || hour >= 19;
}

function uniqueItems(items: ClothingItem[]) {
  return Array.from(new Set(items));
}
