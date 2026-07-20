import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createFallbackExplanation,
  isFollowUpInScope,
} from "@shorts-ai/core";
import { createRecommendation } from "@shorts-ai/core";
import type { RecommendationInput, WeatherSnapshot } from "@shorts-ai/core";

describe("explanation follow-up guardrail", () => {
  it("accepts supported structured intents", () => {
    assert.equal(isFollowUpInScope(undefined, "rain_wind"), true);
    assert.equal(isFollowUpInScope(undefined, "adjust_warmer"), true);
  });

  it("blocks the structured out-of-scope intent", () => {
    assert.equal(isFollowUpInScope(undefined, "out_of_scope"), false);
  });

  it("uses a scoped fallback for unrelated questions", () => {
    const input = createInput();
    const explanation = createFallbackExplanation({
      input,
      recommendation: createRecommendation(input),
      intent: "out_of_scope",
    });

    assert.match(explanation, /I can only help/);
    assert.doesNotMatch(explanation.toLowerCase(), /peanut butter is/);
  });
});

function createInput(): RecommendationInput {
  const current = createWeather();

  return {
    current,
    forecastAtFinish: current,
    forecastAtReturn: current,
    activity: {
      mode: "running",
      startTime: "2026-06-06T18:00",
      durationMinutes: 45,
      returnHomeTime: "2026-06-06T19:30",
      intensity: "medium",
    },
    personalization: {
      starterProfile: "standard",
      ratedRecommendations: 3,
      temperatureOffsetC: 0,
    },
  };
}

function createWeather(overrides: Partial<WeatherSnapshot> = {}): WeatherSnapshot {
  return {
    temperatureC: 18,
    feelsLikeC: 18,
    windKph: 10,
    humidityPercent: 55,
    rainProbabilityPercent: 10,
    uvIndex: 2,
    time: "2026-06-06T18:00",
    locationLabel: "Warsaw, Poland",
    ...overrides,
  };
}
