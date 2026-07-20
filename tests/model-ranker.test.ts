import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyLearnedRanking,
  createRecommendationResult,
  hasProductionRankerCoverage,
  resolveFeatureFlags,
  validateRankerArtifact,
} from "@shorts-ai/core";
import type { LogisticRankerArtifact, RankerCoverage, RecommendationInput, WeatherSnapshot } from "@shorts-ai/core";

describe("learned ranker contract", () => {
  it("validates versioned JSON artifacts and stays in shadow mode before gates", () => {
    const artifact = createArtifact();
    assert.equal(validateRankerArtifact(artifact), true);
    const input = createInput();
    const ranked = applyLearnedRanking(createRecommendationResult(input), input, artifact, coverage({ validOutcomes: 1_999 }), true);
    assert.equal(ranked.source, "rules");
    assert.equal(ranked.modelVersion, artifact.modelVersion);
  });

  it("requires total, activity, and every commute-subtype gate", () => {
    assert.equal(hasProductionRankerCoverage(coverage()), true);
    assert.equal(hasProductionRankerCoverage(coverage({ commuteCar: 99 })), false);
    assert.equal(hasProductionRankerCoverage(coverage({ walking: 199 })), false);
  });

  it("keeps model influence off by default and supports an immediate kill switch", () => {
    assert.equal(resolveFeatureFlags({}).ml_ranker, false);
    assert.equal(resolveFeatureFlags({ FEATURE_ML_RANKER: "true" }).ml_ranker, true);
    assert.equal(resolveFeatureFlags({ FEATURE_ML_RANKER: "false" }).ml_ranker, false);
  });
});

function createArtifact(): LogisticRankerArtifact {
  return {
    artifactType: "shortsai-multinomial-logistic-regression",
    datasetVersion: "swaop-test",
    modelVersion: "ranker-test",
    featureSchema: ["variant_standard"],
    normalization: { variant_standard: { mean: 0, scale: 1 } },
    classOrder: ["too_cold", "good", "too_warm"],
    coefficients: [[0], [1], [0]],
    intercepts: [0, 0, 0],
    calibration: { method: "none" },
    metrics: { accuracy: 0.5 },
    trainedAt: "2026-07-19T10:00:00Z",
  };
}

function coverage(overrides: Partial<RankerCoverage> = {}): RankerCoverage {
  return { validOutcomes: 2_000, running: 300, walking: 200, commute: 400, commuteWalking: 100, commuteTransit: 100, commuteBicycle: 100, commuteCar: 100, ...overrides };
}

function createInput(): RecommendationInput {
  const weather = createWeather();
  return {
    current: weather, forecastAtFinish: weather, forecastAtReturn: weather,
    activity: { mode: "walking", startTime: weather.time, returnHomeTime: "2026-07-19T11:00:00Z", durationMinutes: 45 },
    personalization: { starterProfile: "standard", ratedRecommendations: 0 },
  };
}

function createWeather(): WeatherSnapshot {
  return { temperatureC: 17, feelsLikeC: 17, windKph: 10, humidityPercent: 50, rainProbabilityPercent: 10, uvIndex: 2, time: "2026-07-19T10:00:00Z", locationLabel: "Test" };
}
