import type {
  ClothingItem,
  Recommendation,
  RecommendationInput,
  RiskWarning,
  RunningIntensity,
  RunningRecommendation,
  WeatherSnapshot,
} from "@/types/domain";
import { getPersonalizationStage, starterProfiles } from "./profiles";

const intensityHeatOffsets: Record<RunningIntensity, number> = {
  easy: 2,
  medium: 4,
  hard: 6,
};

export function createRecommendation(input: RecommendationInput): Recommendation {
  const profile = starterProfiles[input.personalization.starterProfile];
  const personalizationOffset = input.personalization.temperatureOffsetC ?? 0;
  const profileFeelsLike =
    input.current.feelsLikeC + profile.temperatureOffsetC + personalizationOffset;

  const riskWarnings = getRiskWarnings(input);
  const personalizationStage = getPersonalizationStage(
    input.personalization.ratedRecommendations,
  );

  if (input.activity.mode === "running") {
    const running = createRunningRecommendation(input);

    return {
      activityMode: "running",
      headline: buildRunningHeadline(running),
      outfit: uniqueItems([
        ...running.warmUp,
        ...running.mainRun,
        ...running.postRun,
      ]),
      running,
      confidenceScore: getConfidenceScore(input.current, riskWarnings),
      explanationFacts: [
        `Current feels-like temperature is ${input.current.feelsLikeC} C.`,
        `Running intensity adds body heat during the main effort.`,
        `Return-home feels-like temperature is ${input.forecastAtReturn.feelsLikeC} C.`,
      ],
      riskWarnings,
      personalizationStage,
    };
  }

  const outfit = getBaseOutfit(profileFeelsLike, input.current);

  return {
    activityMode: input.activity.mode,
    headline: buildEverydayHeadline(outfit),
    outfit,
    confidenceScore: getConfidenceScore(input.current, riskWarnings),
    explanationFacts: [
      `Current feels-like temperature is ${input.current.feelsLikeC} C.`,
      `Starter profile adjustment is ${profile.temperatureOffsetC} C.`,
      `Return-home feels-like temperature is ${input.forecastAtReturn.feelsLikeC} C.`,
    ],
    riskWarnings,
    personalizationStage,
  };
}

function createRunningRecommendation(input: RecommendationInput): RunningRecommendation {
  const profile = starterProfiles[input.personalization.starterProfile];
  const intensity = input.activity.intensity ?? "medium";
  const personalizationOffset = input.personalization.temperatureOffsetC ?? 0;
  const runningFeelsLike =
    input.current.feelsLikeC +
    profile.temperatureOffsetC +
    profile.runningHeatOffsetC +
    intensityHeatOffsets[intensity] +
    personalizationOffset;
  const returnFeelsLike =
    input.forecastAtReturn.feelsLikeC + profile.temperatureOffsetC + personalizationOffset;
  const mainRun = getBaseOutfit(runningFeelsLike, input.current);
  const warmUp = getWarmUpOutfit(mainRun, input.current.feelsLikeC + profile.temperatureOffsetC);
  const postRun = getPostRunOutfit(returnFeelsLike, input.forecastAtReturn);
  const hydrationReminder =
    input.current.temperatureC >= 24 ||
    input.current.humidityPercent >= 75 ||
    input.activity.durationMinutes >= 60;
  const visibilityReminder = isLowVisibilityTime(input.activity.startTime);

  return {
    warmUp,
    mainRun,
    postRun,
    carryExtraLayer: profile.prefersExtraLayer || postRun.length > mainRun.length,
    hydrationReminder,
    visibilityReminder,
  };
}

function getBaseOutfit(adjustedFeelsLikeC: number, weather: WeatherSnapshot): ClothingItem[] {
  const outfit: ClothingItem[] = [];

  if (adjustedFeelsLikeC >= 18) {
    outfit.push("shorts");
  } else {
    outfit.push("long_pants");
  }

  if (adjustedFeelsLikeC >= 17) {
    outfit.push("t_shirt");
  } else if (adjustedFeelsLikeC >= 10) {
    outfit.push("long_sleeve");
  } else {
    outfit.push("long_sleeve", "hoodie");
  }

  if (adjustedFeelsLikeC < 12) {
    outfit.push("light_jacket");
  }

  if (weather.rainProbabilityPercent >= 55) {
    outfit.push("rain_jacket");
  }

  if (adjustedFeelsLikeC < 6) {
    outfit.push("gloves", "hat");
  }

  return uniqueItems(outfit);
}

function getWarmUpOutfit(mainRun: ClothingItem[], currentFeelsLikeC: number): ClothingItem[] {
  const outfit = [...mainRun];

  if (currentFeelsLikeC < 14 && !outfit.includes("hoodie")) {
    outfit.push("hoodie");
  }

  if (currentFeelsLikeC < 9 && !outfit.includes("light_jacket")) {
    outfit.push("light_jacket");
  }

  return uniqueItems(outfit);
}

function getPostRunOutfit(returnFeelsLikeC: number, weather: WeatherSnapshot): ClothingItem[] {
  return getBaseOutfit(returnFeelsLikeC, weather);
}

function getRiskWarnings(input: RecommendationInput): RiskWarning[] {
  const warnings: RiskWarning[] = [];
  const temperatureDrop = input.current.feelsLikeC - input.forecastAtReturn.feelsLikeC;

  if (temperatureDrop >= 4 || input.forecastAtReturn.feelsLikeC <= 10) {
    warnings.push({
      type: "cold_later",
      severity: temperatureDrop >= 7 ? "high" : "medium",
      message: "It will feel colder by the time you return home.",
    });
  }

  if (
    input.current.rainProbabilityPercent >= 55 ||
    input.forecastAtReturn.rainProbabilityPercent >= 55
  ) {
    warnings.push({
      type: "rain_likely",
      severity:
        Math.max(
          input.current.rainProbabilityPercent,
          input.forecastAtReturn.rainProbabilityPercent,
        ) >= 75
          ? "high"
          : "medium",
      message: "Rain is likely during the plan window.",
    });
  }

  if (Math.max(input.current.windKph, input.forecastAtReturn.windKph) >= 25) {
    warnings.push({
      type: "strong_wind",
      severity: Math.max(input.current.windKph, input.forecastAtReturn.windKph) >= 35 ? "high" : "medium",
      message: "Wind may make the outfit feel colder than the raw temperature suggests.",
    });
  }

  if (
    input.activity.mode === "running" &&
    input.current.temperatureC >= 24 &&
    (input.activity.intensity === "medium" || input.activity.intensity === "hard")
  ) {
    warnings.push({
      type: "overheating",
      severity: input.current.temperatureC >= 29 ? "high" : "medium",
      message: "The run may feel warmer once your body temperature rises.",
    });
  }

  if (input.activity.mode === "running" && isLowVisibilityTime(input.activity.startTime)) {
    warnings.push({
      type: "low_visibility",
      severity: "low",
      message: "Evening runs need visible or reflective clothing.",
    });
  }

  return warnings;
}

function getConfidenceScore(weather: WeatherSnapshot, warnings: RiskWarning[]) {
  const dataPenalty =
    weather.rainProbabilityPercent > 45 ? 6 : 0;
  const riskPenalty = warnings.reduce((total, warning) => {
    if (warning.severity === "high") {
      return total + 8;
    }

    if (warning.severity === "medium") {
      return total + 5;
    }

    return total + 2;
  }, 0);

  return Math.max(58, Math.min(94, 90 - dataPenalty - riskPenalty));
}

function buildRunningHeadline(running: RunningRecommendation) {
  if (running.carryExtraLayer) {
    return "Run light, carry a warmer layer for after.";
  }

  if (running.hydrationReminder) {
    return "Keep the outfit light and bring water.";
  }

  return "Conditions are stable enough for a simple run outfit.";
}

function buildEverydayHeadline(outfit: ClothingItem[]) {
  if (outfit.includes("rain_jacket")) {
    return "Take rain protection with your base outfit.";
  }

  if (outfit.includes("hoodie") || outfit.includes("light_jacket")) {
    return "Layer up for comfort outside.";
  }

  return "Light clothing should be enough.";
}

function isLowVisibilityTime(time: string) {
  const hour = Number(time.slice(11, 13));

  return Number.isFinite(hour) && (hour < 7 || hour >= 19);
}

function uniqueItems(items: ClothingItem[]) {
  return Array.from(new Set(items));
}
