import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/explain/route";
import { createRecommendation, createRecommendationResult } from "@shorts-ai/core";
import type { RecommendationInput, WeatherSnapshot } from "@shorts-ai/core";

describe("/api/explain request guardrails", () => {
  it("rejects oversized requests before parsing JSON", async () => {
    const response = await POST(
      new Request("https://shorts-ai.test/api/explain", {
        method: "POST",
        headers: {
          "content-length": String(26 * 1024),
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );

    assert.equal(response.status, 413);
  });

  it("rejects invalid JSON without throwing", async () => {
    const response = await POST(
      new Request("https://shorts-ai.test/api/explain", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: "{not-json",
      }),
    );
    const body = (await response.json()) as { error?: string };

    assert.equal(response.status, 400);
    assert.equal(body.error, "Explanation request must contain valid JSON.");
  });

  it("rejects payloads without required recommendation data", async () => {
    const response = await POST(
      new Request("https://shorts-ai.test/api/explain", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ question: "Do I need a jacket?" }),
      }),
    );

    assert.equal(response.status, 400);
  });

  it("rejects overlong follow-up questions", async () => {
    const input = createInput();
    const response = await POST(
      new Request("https://shorts-ai.test/api/explain", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          input,
          recommendation: createRecommendation(input),
          question: "wind ".repeat(80),
        }),
      }),
    );

    assert.equal(response.status, 400);
  });

  it("fails closed when persistent rate limiting is required without an HMAC secret", async () => {
    const previousRequirePersistentRateLimit = process.env.REQUIRE_PERSISTENT_RATE_LIMIT;
    const previousRateLimitHashSecret = process.env.RATE_LIMIT_HASH_SECRET;
    const input = createInput();

    process.env.REQUIRE_PERSISTENT_RATE_LIMIT = "true";
    delete process.env.RATE_LIMIT_HASH_SECRET;

    try {
      const response = await POST(
        new Request("https://shorts-ai.test/api/explain", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            input,
            recommendation: createRecommendation(input),
            question: "Do I need a wind shell?",
          }),
        }),
      );
      const body = (await response.json()) as { error?: string; source?: string };

      assert.equal(response.status, 503);
      assert.equal(body.source, "fallback");
      assert.equal(body.error, "Explanation rate limiting is temporarily unavailable.");
    } finally {
      restoreEnv("REQUIRE_PERSISTENT_RATE_LIMIT", previousRequirePersistentRateLimit);
      restoreEnv("RATE_LIMIT_HASH_SECRET", previousRateLimitHashSecret);
    }
  });

  it("handles shortcut adjustments deterministically without an LLM", async () => {
    const input = createInput();
    const recommendationResult = createRecommendationResult(input);
    const response = await POST(new Request("https://shorts-ai.test/api/explain", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input,
        recommendation: recommendationResult.recommendation,
        recommendationResult,
        source: "shortcut",
        intent: "adjust_warmer",
      }),
    }));
    const body = await response.json() as { source: string; action: string; recommendationResult?: { selectedVariantId: string } };

    assert.equal(response.status, 200);
    assert.equal(body.source, "deterministic");
    assert.equal(body.action, "recalculate");
    assert.equal(body.recommendationResult?.selectedVariantId, "variant-warmer");
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

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
