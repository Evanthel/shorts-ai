import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createRecommendationPresentation,
  createRecommendationResult,
  type RecommendationInput,
} from "@shorts-ai/core";

describe("recommendation presentation", () => {
  it("puts the main running outfit first and separates carry and return layers", () => {
    const input = createInput("running", 16, 6);
    const result = createRecommendationResult(input);
    const presentation = createRecommendationPresentation(input, result);

    assert.deepEqual(presentation.wear, result.recommendation.running?.mainRun);
    assert.deepEqual(presentation.forReturn, result.recommendation.running?.postRun);
    assert.ok(presentation.carry.every((item) => !presentation.wear.includes(item)));
    assert.match(presentation.returnSummary, /colder/);
  });

  it("uses one safe outfit across a commute and avoids inventing a carried layer", () => {
    const input = createInput("commute", 14, 13);
    const result = createRecommendationResult(input);
    const presentation = createRecommendationPresentation(input, result);

    assert.deepEqual(presentation.wear, result.recommendation.outfit);
    assert.deepEqual(presentation.forReturn, result.recommendation.outfit);
    assert.deepEqual(presentation.carry, []);
    assert.match(presentation.returnSummary, /remains suitable/);
  });
});

function createInput(mode: "running" | "commute", start: number, returned: number): RecommendationInput {
  return {
    current: weather(start, "2026-10-10T17:00"),
    forecastAtFinish: weather(start - 1, "2026-10-10T18:00"),
    forecastAtReturn: weather(returned, "2026-10-10T20:00"),
    activity: {
      mode,
      startTime: "2026-10-10T17:00",
      durationMinutes: 60,
      returnHomeTime: "2026-10-10T20:00",
      ...(mode === "running"
        ? { intensity: "medium" as const }
        : { commute: { mode: "transit" as const, outdoorMinutes: 20, canCarryLayer: true } }),
    },
    personalization: { starterProfile: "standard", ratedRecommendations: 0 },
  };
}

function weather(feelsLikeC: number, time: string) {
  return {
    temperatureC: feelsLikeC,
    feelsLikeC,
    windKph: 12,
    humidityPercent: 55,
    rainProbabilityPercent: 10,
    uvIndex: 1,
    time,
    locationLabel: "Test location",
  };
}
