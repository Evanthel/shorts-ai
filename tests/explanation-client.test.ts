import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createRecommendationResult,
  withExplanationFallback,
  type ExplanationRequest,
  type RecommendationInput,
} from "@shorts-ai/core";

describe("explanation transport fallback", () => {
  it("returns a useful deterministic explanation when the backend is unavailable", async () => {
    const payload = createPayload("return_conditions");
    const response = await withExplanationFallback(payload, async () => {
      throw new Error("offline");
    });

    assert.equal(response.source, "fallback");
    assert.equal(response.intent, "return_conditions");
    assert.equal(response.action, "explain");
    assert.match(response.explanation, /start/i);
    assert.match(response.explanation, /return/i);
  });

  it("preserves a successful server response", async () => {
    const payload = createPayload("why_outfit");
    const response = await withExplanationFallback(payload, async () => ({
      explanation: "Server explanation",
      source: "deterministic",
      scope: "in_scope",
    }));

    assert.equal(response.explanation, "Server explanation");
    assert.equal(response.source, "deterministic");
  });
});

function createPayload(intent: ExplanationRequest["intent"]): ExplanationRequest {
  const input: RecommendationInput = {
    current: weather(14, "2026-10-10T17:00"),
    forecastAtFinish: weather(13, "2026-10-10T18:00"),
    forecastAtReturn: weather(8, "2026-10-10T20:00"),
    activity: {
      mode: "walking",
      startTime: "2026-10-10T17:00",
      durationMinutes: 60,
      returnHomeTime: "2026-10-10T20:00",
    },
    personalization: { starterProfile: "standard", ratedRecommendations: 0 },
  };
  const result = createRecommendationResult(input);
  return { input, recommendation: result.recommendation, recommendationResult: result, intent, source: "shortcut" };
}

function weather(feelsLikeC: number, time: string) {
  return {
    temperatureC: feelsLikeC,
    feelsLikeC,
    windKph: 10,
    humidityPercent: 55,
    rainProbabilityPercent: 10,
    uvIndex: 1,
    time,
    locationLabel: "Test location",
  };
}
