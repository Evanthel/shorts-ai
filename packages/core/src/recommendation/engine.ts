import type {
  ClothingItem,
  CommuteMode,
  OutfitVariant,
  OutfitVariantKind,
  PersonalizationSignal,
  Recommendation,
  RecommendationConstraints,
  RecommendationInput,
  RecommendationResult,
  RunningIntensity,
  RunningRecommendation,
  WeatherSnapshot,
} from "../domain";
import { getContextTemperatureOffset } from "../feedback";
import { getPersonalizationStage, starterProfiles } from "./profiles";
import { applySafetyPolicy, SAFETY_POLICY_VERSION } from "./safety";

export const ENGINE_VERSION = "shortsai-rules-v2";

const intensityHeatOffsets: Record<RunningIntensity, number> = {
  easy: 2,
  medium: 4,
  hard: 6,
};

const commuteHeatOffsets: Record<CommuteMode, number> = {
  walking: 2,
  transit: 0,
  bicycle: 4,
  car: 0,
};

const variantThermalShift: Record<OutfitVariantKind, number> = {
  lighter: 2,
  standard: 0,
  warmer: -2,
};

export function createRecommendation(input: RecommendationInput): Recommendation {
  return createRecommendationForShift(input, 0);
}

export function createRecommendationResult(
  input: RecommendationInput,
  constraints: RecommendationConstraints = {},
): RecommendationResult {
  const effectiveInput = constraints.canCarryLayer !== undefined && input.activity.mode === "commute"
    ? {
        ...input,
        activity: {
          ...input.activity,
          commute: {
            ...(input.activity.commute ?? { mode: "walking" as const, outdoorMinutes: input.activity.durationMinutes }),
            canCarryLayer: constraints.canCarryLayer,
          },
        },
      }
    : input;
  const safety = applySafetyPolicy(effectiveInput);
  const variants = (["standard", "lighter", "warmer"] as const)
    .map((kind) => {
      const recommendation = createRecommendationForShift(
        effectiveInput,
        variantThermalShift[kind],
        safety.requiredItems,
        constraints.avoidedItems,
      );

      return {
        id: `variant-${kind}`,
        kind,
        outfit: recommendation.outfit,
        ...(recommendation.running ? { running: recommendation.running } : {}),
        requiredItems: safety.requiredItems,
        recommendation,
      };
    })
    .filter((candidate, index, candidates) =>
      candidates.findIndex((other) => variantSignature(other) === variantSignature(candidate)) === index,
    );

  const requestedKind = constraints.thermalBias === "lighter"
    ? "lighter"
    : constraints.thermalBias === "warmer"
      ? "warmer"
      : "standard";
  const selected = variants.find((variant) => variant.kind === requestedKind) ?? variants[0];

  return {
    source: "rules",
    engineVersion: ENGINE_VERSION,
    safetyPolicyVersion: SAFETY_POLICY_VERSION,
    selectedVariantId: selected.id,
    variants: variants.map(toOutfitVariant),
    recommendation: selected.recommendation,
  };
}

function createRecommendationForShift(
  input: RecommendationInput,
  thermalShiftC: number,
  requiredItems: ClothingItem[] = applySafetyPolicy(input).requiredItems,
  avoidedItems: ClothingItem[] = [],
): Recommendation {
  const profile = starterProfiles[input.personalization.starterProfile];
  const contextOffset = getContextTemperatureOffset(
    input.activity,
    input.personalization.comfortMemory,
    input.personalization.temperatureOffsetC ?? 0,
  );
  const activityHeatOffset = input.activity.mode === "commute"
    ? commuteHeatOffsets[input.activity.commute?.mode ?? "walking"]
    : input.activity.mode === "walking"
      ? 1
      : 0;
  const profileFeelsLike =
    input.current.feelsLikeC +
    profile.temperatureOffsetC +
    contextOffset +
    activityHeatOffset +
    thermalShiftC;
  const safety = applySafetyPolicy(input);
  const personalizationStage = getPersonalizationStage(
    input.personalization.ratedRecommendations,
  );
  const profileSignals = getPersonalizationSignals(input, contextOffset);

  if (input.activity.mode === "running") {
    const running = createRunningRecommendation(
      input,
      contextOffset,
      thermalShiftC,
      requiredItems,
      avoidedItems,
    );

    return {
      activityMode: "running",
      headline: buildRunningHeadline(running),
      outfit: uniqueItems([...running.warmUp, ...running.mainRun, ...running.postRun]),
      running,
      confidenceScore: getConfidenceScore(input.current, safety.warnings),
      explanationFacts: [
        `Current feels-like temperature is ${input.current.feelsLikeC} C.`,
        "Running intensity adds body heat during the main effort.",
        `Return-home feels-like temperature is ${input.forecastAtReturn.feelsLikeC} C.`,
      ],
      riskWarnings: safety.warnings,
      personalizationStage,
      profileSignals,
    };
  }

  const outfit = finalizeOutfit(
    getBaseOutfit(profileFeelsLike, input.current),
    requiredItems,
    avoidedItems,
  );

  return {
    activityMode: input.activity.mode,
    headline: buildEverydayHeadline(outfit, input.activity.mode),
    outfit,
    confidenceScore: getConfidenceScore(input.current, safety.warnings),
    explanationFacts: [
      `Current feels-like temperature is ${input.current.feelsLikeC} C.`,
      `Context comfort adjustment is ${formatSignedC(contextOffset)}.`,
      `Return-home feels-like temperature is ${input.forecastAtReturn.feelsLikeC} C.`,
      ...(input.activity.mode === "commute"
        ? [`Outdoor exposure is ${input.activity.commute?.outdoorMinutes ?? input.activity.durationMinutes} minutes.`]
        : []),
    ],
    riskWarnings: safety.warnings,
    personalizationStage,
    profileSignals,
  };
}

function createRunningRecommendation(
  input: RecommendationInput,
  contextOffset: number,
  thermalShiftC: number,
  requiredItems: ClothingItem[],
  avoidedItems: ClothingItem[],
): RunningRecommendation {
  const profile = starterProfiles[input.personalization.starterProfile];
  const intensity = input.activity.intensity ?? "medium";
  const runningFeelsLike =
    input.current.feelsLikeC +
    profile.temperatureOffsetC +
    profile.runningHeatOffsetC +
    intensityHeatOffsets[intensity] +
    contextOffset +
    thermalShiftC;
  const returnFeelsLike =
    input.forecastAtReturn.feelsLikeC +
    profile.temperatureOffsetC +
    contextOffset +
    thermalShiftC;
  const rawMainRun = getBaseOutfit(runningFeelsLike, input.current);
  const rawWarmUp = getWarmUpOutfit(
    rawMainRun,
    input.current.feelsLikeC + profile.temperatureOffsetC + contextOffset + thermalShiftC,
  );
  const rawPostRun = getBaseOutfit(returnFeelsLike, input.forecastAtReturn);
  const mainRun = finalizeOutfit(rawMainRun, requiredItems, avoidedItems);
  const warmUp = finalizeOutfit(rawWarmUp, requiredItems, avoidedItems);
  const postRun = finalizeOutfit(rawPostRun, requiredItems, avoidedItems);

  return {
    warmUp,
    mainRun,
    postRun,
    carryExtraLayer: profile.prefersExtraLayer || postRun.length > mainRun.length,
    hydrationReminder:
      input.current.temperatureC >= 24 ||
      input.current.humidityPercent >= 75 ||
      input.activity.durationMinutes >= 60,
    visibilityReminder: isLowVisibilityTime(input.activity.startTime),
  };
}

function getBaseOutfit(adjustedFeelsLikeC: number, weather: WeatherSnapshot): ClothingItem[] {
  const outfit: ClothingItem[] = [];
  outfit.push(adjustedFeelsLikeC >= 18 ? "shorts" : "long_pants");

  if (adjustedFeelsLikeC >= 17) outfit.push("t_shirt");
  else if (adjustedFeelsLikeC >= 10) outfit.push("long_sleeve");
  else outfit.push("long_sleeve", "hoodie");

  if (adjustedFeelsLikeC < 12) outfit.push("light_jacket");
  if (weather.rainProbabilityPercent >= 55) outfit.push("rain_jacket");
  if (adjustedFeelsLikeC < 6) outfit.push("gloves", "hat");

  return uniqueItems(outfit);
}

function getWarmUpOutfit(mainRun: ClothingItem[], currentFeelsLikeC: number): ClothingItem[] {
  const outfit = [...mainRun];
  if (currentFeelsLikeC < 14 && !outfit.includes("hoodie")) outfit.push("hoodie");
  if (currentFeelsLikeC < 9 && !outfit.includes("light_jacket")) outfit.push("light_jacket");
  return uniqueItems(outfit);
}

function finalizeOutfit(
  outfit: ClothingItem[],
  requiredItems: ClothingItem[],
  avoidedItems: ClothingItem[],
) {
  const required = new Set(requiredItems);
  const substitutions: Partial<Record<ClothingItem, ClothingItem>> = {
    shorts: "long_pants",
    long_pants: "shorts",
    t_shirt: "long_sleeve",
    long_sleeve: "t_shirt",
    hoodie: "light_jacket",
    light_jacket: "hoodie",
  };
  const adjusted = outfit.flatMap((item) => {
    if (!avoidedItems.includes(item) || required.has(item)) return [item];
    const substitute = substitutions[item];
    return substitute && !avoidedItems.includes(substitute) ? [substitute] : [];
  });
  return uniqueItems([
    ...adjusted,
    ...requiredItems,
  ]);
}

function getConfidenceScore(weather: WeatherSnapshot, warnings: Recommendation["riskWarnings"]) {
  const dataPenalty = weather.rainProbabilityPercent > 45 ? 6 : 0;
  const riskPenalty = warnings.reduce((total, warning) =>
    total + (warning.severity === "high" ? 8 : warning.severity === "medium" ? 5 : 2), 0);
  return Math.max(58, Math.min(94, 90 - dataPenalty - riskPenalty));
}

function getPersonalizationSignals(
  input: RecommendationInput,
  contextOffset: number,
): PersonalizationSignal[] {
  const profile = starterProfiles[input.personalization.starterProfile];
  const activityImpact = input.activity.mode === "running"
    ? `${profile.runningHeatOffsetC + intensityHeatOffsets[input.activity.intensity ?? "medium"]} C body-heat adjustment`
    : input.activity.mode === "commute"
      ? `${commuteHeatOffsets[input.activity.commute?.mode ?? "walking"]} C commute adjustment`
      : "1 C walking adjustment";
  const signals: PersonalizationSignal[] = [
    {
      label: "Starter profile",
      value: `${profile.label} (${formatSignedC(profile.temperatureOffsetC)})`,
      impact: profile.temperatureOffsetC < 0 ? "warmer" : profile.temperatureOffsetC > 0 ? "lighter" : "neutral",
    },
    {
      label: "Context memory",
      value: contextOffset === 0 ? "No saved shift for this activity" : `${formatSignedC(contextOffset)} for this activity`,
      impact: contextOffset < 0 ? "warmer" : contextOffset > 0 ? "lighter" : "neutral",
    },
    {
      label: "Activity load",
      value: activityImpact,
      impact: "lighter",
    },
  ];

  if (profile.prefersExtraLayer || input.forecastAtReturn.feelsLikeC < input.current.feelsLikeC - 3) {
    signals.push({ label: "Return check", value: "Later conditions can require extra coverage", impact: "warmer" });
  }
  return signals;
}

function buildRunningHeadline(running: RunningRecommendation) {
  if (running.mainRun.includes("shorts") && running.postRun.includes("light_jacket")) return "Run light, carry warmth for the return.";
  if (running.mainRun.includes("rain_jacket")) return "Prioritize rain protection for this run.";
  if (running.hydrationReminder) return "Keep the outfit breathable and plan hydration.";
  return "A balanced running outfit fits this window.";
}

function buildEverydayHeadline(outfit: ClothingItem[], mode: "walking" | "commute") {
  if (outfit.includes("rain_jacket")) return "Bring rain protection for this plan.";
  if (outfit.includes("hoodie") || outfit.includes("light_jacket")) return "Layer up for comfort outside.";
  if (outfit.includes("shorts")) return mode === "commute" ? "A light commute outfit should be comfortable." : "Light clothing should be comfortable.";
  return mode === "commute" ? "A practical layered outfit fits this commute." : "A simple covered outfit fits the conditions.";
}

function isLowVisibilityTime(value: string) {
  const hour = new Date(value).getHours();
  return hour < 7 || hour >= 19;
}

function uniqueItems(items: ClothingItem[]) {
  return Array.from(new Set(items));
}

function formatSignedC(value: number) {
  return `${value > 0 ? "+" : ""}${value} C`;
}

function variantSignature(variant: OutfitVariant & { recommendation: Recommendation }) {
  const running = variant.running
    ? [variant.running.warmUp, variant.running.mainRun, variant.running.postRun]
    : [];
  return JSON.stringify([variant.outfit, running]);
}

function toOutfitVariant(candidate: OutfitVariant & { recommendation: Recommendation }): OutfitVariant {
  return {
    id: candidate.id,
    kind: candidate.kind,
    outfit: candidate.outfit,
    ...(candidate.running ? { running: candidate.running } : {}),
    requiredItems: candidate.requiredItems,
    ...(candidate.modelScore !== undefined ? { modelScore: candidate.modelScore } : {}),
  };
}
