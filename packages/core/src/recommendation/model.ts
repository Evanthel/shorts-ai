import type {
  OutfitVariant,
  RecommendationInput,
  RecommendationResult,
} from "../domain";
import { getContextTemperatureOffset } from "../feedback";

export type RankerClass = "too_cold" | "good" | "too_warm";

export type LogisticRankerArtifact = {
  artifactType: "shortsai-multinomial-logistic-regression";
  datasetVersion: string;
  modelVersion: string;
  featureSchema: string[];
  normalization: Record<string, { mean: number; scale: number }>;
  classOrder: RankerClass[];
  coefficients: number[][];
  intercepts: number[];
  calibration: { method: "none" | "temperature"; temperature?: number };
  metrics: Record<string, number>;
  trainedAt: string;
};

export type RankerCoverage = {
  validOutcomes: number;
  running: number;
  walking: number;
  commute: number;
  commuteWalking: number;
  commuteTransit: number;
  commuteBicycle: number;
  commuteCar: number;
};

export const SHADOW_TRAINING_MINIMUM = 500;

export function validateRankerArtifact(value: unknown): value is LogisticRankerArtifact {
  if (!isRecord(value)) return false;
  const schema = value.featureSchema;
  const classes = value.classOrder;
  const coefficients = value.coefficients;
  const intercepts = value.intercepts;
  return value.artifactType === "shortsai-multinomial-logistic-regression" &&
    typeof value.datasetVersion === "string" &&
    typeof value.modelVersion === "string" &&
    Array.isArray(schema) && schema.every((item) => typeof item === "string") &&
    Array.isArray(classes) && classes.length === 3 &&
    classes.includes("too_cold") && classes.includes("good") && classes.includes("too_warm") &&
    Array.isArray(coefficients) && coefficients.length === classes.length &&
    coefficients.every((row) => Array.isArray(row) && row.length === schema.length && row.every(isFiniteNumber)) &&
    Array.isArray(intercepts) && intercepts.length === classes.length && intercepts.every(isFiniteNumber) &&
    isRecord(value.normalization) && isRecord(value.calibration) && isRecord(value.metrics) &&
    typeof value.trainedAt === "string";
}

export function hasProductionRankerCoverage(coverage: RankerCoverage) {
  return coverage.validOutcomes >= 2_000 &&
    coverage.running >= 300 &&
    coverage.commute >= 300 &&
    coverage.walking >= 200 &&
    coverage.commuteWalking >= 100 &&
    coverage.commuteTransit >= 100 &&
    coverage.commuteBicycle >= 100 &&
    coverage.commuteCar >= 100;
}

export function scoreSafeCandidates(
  result: RecommendationResult,
  input: RecommendationInput,
  artifact: LogisticRankerArtifact,
) {
  return result.variants.map((variant) => ({
    variant,
    probabilities: predictProbabilities(createFeatureValues(input, variant), artifact),
  }));
}

export function applyLearnedRanking(
  result: RecommendationResult,
  input: RecommendationInput,
  artifact: LogisticRankerArtifact,
  coverage: RankerCoverage,
  enabled: boolean,
): RecommendationResult {
  const scored = scoreSafeCandidates(result, input, artifact);
  const goodIndex = artifact.classOrder.indexOf("good");
  const variants = scored.map(({ variant, probabilities }) => ({
    ...variant,
    modelScore: probabilities[goodIndex],
  }));

  if (!enabled || !hasProductionRankerCoverage(coverage)) {
    return { ...result, variants, modelVersion: artifact.modelVersion };
  }

  const selected = [...variants].sort((a, b) => (b.modelScore ?? 0) - (a.modelScore ?? 0))[0];
  return {
    ...result,
    source: "model",
    modelVersion: artifact.modelVersion,
    selectedVariantId: selected.id,
    variants,
    recommendation: {
      ...result.recommendation,
      outfit: selected.outfit,
      ...(selected.running ? { running: selected.running } : {}),
    },
  };
}

function predictProbabilities(
  values: Record<string, number>,
  artifact: LogisticRankerArtifact,
) {
  const logits = artifact.coefficients.map((weights, classIndex) =>
    weights.reduce((total, weight, featureIndex) => {
      const name = artifact.featureSchema[featureIndex];
      const raw = values[name] ?? 0;
      const normalization = artifact.normalization[name];
      const normalized = normalization && normalization.scale !== 0
        ? (raw - normalization.mean) / normalization.scale
        : raw;
      return total + weight * normalized;
    }, artifact.intercepts[classIndex]),
  );
  const calibrationTemperature = artifact.calibration.method === "temperature"
    ? Math.max(0.01, artifact.calibration.temperature ?? 1)
    : 1;
  const adjusted = logits.map((value) => value / calibrationTemperature);
  const max = Math.max(...adjusted);
  const exponentials = adjusted.map((value) => Math.exp(value - max));
  const denominator = exponentials.reduce((total, value) => total + value, 0);
  return exponentials.map((value) => value / denominator);
}

function createFeatureValues(input: RecommendationInput, variant: OutfitVariant) {
  const values: Record<string, number> = {
    start_temperature_c: input.current.temperatureC,
    start_feels_like_c: input.current.feelsLikeC,
    finish_feels_like_c: input.forecastAtFinish.feelsLikeC,
    return_feels_like_c: input.forecastAtReturn.feelsLikeC,
    return_delta_c: input.forecastAtReturn.feelsLikeC - input.current.feelsLikeC,
    wind_kph: Math.max(input.current.windKph, input.forecastAtReturn.windKph),
    rain_probability: Math.max(input.current.rainProbabilityPercent, input.forecastAtReturn.rainProbabilityPercent),
    humidity_percent: input.current.humidityPercent,
    duration_minutes: input.activity.durationMinutes,
    outdoor_minutes: input.activity.commute?.outdoorMinutes ?? input.activity.durationMinutes,
    comfort_offset_c: getContextTemperatureOffset(
      input.activity,
      input.personalization.comfortMemory,
      input.personalization.temperatureOffsetC ?? 0,
    ),
    activity_running: input.activity.mode === "running" ? 1 : 0,
    activity_walking: input.activity.mode === "walking" ? 1 : 0,
    activity_commute: input.activity.mode === "commute" ? 1 : 0,
    intensity_easy: input.activity.mode === "running" && input.activity.intensity === "easy" ? 1 : 0,
    intensity_medium: input.activity.mode === "running" && (input.activity.intensity ?? "medium") === "medium" ? 1 : 0,
    intensity_hard: input.activity.mode === "running" && input.activity.intensity === "hard" ? 1 : 0,
    commute_walking: input.activity.commute?.mode === "walking" ? 1 : 0,
    commute_transit: input.activity.commute?.mode === "transit" ? 1 : 0,
    commute_bicycle: input.activity.commute?.mode === "bicycle" ? 1 : 0,
    commute_car: input.activity.commute?.mode === "car" ? 1 : 0,
    can_carry_layer: input.activity.commute?.canCarryLayer ? 1 : 0,
    variant_lighter: variant.kind === "lighter" ? 1 : 0,
    variant_standard: variant.kind === "standard" ? 1 : 0,
    variant_warmer: variant.kind === "warmer" ? 1 : 0,
  };

  for (const item of variant.outfit) values[`item_${item}`] = 1;
  return values;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
