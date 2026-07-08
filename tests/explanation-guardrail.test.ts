import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createFallbackExplanation,
  isFollowUpInScope,
} from "@shorts-ai/core";
import { createRecommendation } from "@shorts-ai/core";
import type { RecommendationInput, WeatherSnapshot } from "@shorts-ai/core";

describe("explanation follow-up guardrail", () => {
  it("allows questions about the current outfit plan", () => {
    assert.equal(isFollowUpInScope("Do I really need a hoodie for this run?"), true);
    assert.equal(isFollowUpInScope("Will the wind make the return colder?"), true);
  });

  it("blocks unrelated general knowledge questions", () => {
    assert.equal(isFollowUpInScope("What is peanut butter?"), false);
    assert.equal(isFollowUpInScope("Who invented the piano?"), false);
  });

  it("uses a scoped fallback for unrelated questions", () => {
    const input = createInput();
    const explanation = createFallbackExplanation({
      input,
      recommendation: createRecommendation(input),
      question: "What is peanut butter?",
    });

    assert.match(explanation, /I can only answer follow-up questions/);
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
