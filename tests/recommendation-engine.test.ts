import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRecommendation } from "@shorts-ai/core";
import type { RecommendationInput, WeatherSnapshot } from "@shorts-ai/core";

describe("recommendation engine", () => {
  it("keeps warm running recommendations light and adds hydration guidance", () => {
    const recommendation = createRecommendation(
      createInput({
        current: createWeather({ temperatureC: 27, feelsLikeC: 28, humidityPercent: 78 }),
        activity: { mode: "running", intensity: "hard", durationMinutes: 70 },
      }),
    );

    assert.equal(recommendation.activityMode, "running");
    assert.ok(recommendation.running);
    assert.ok(recommendation.running.mainRun.includes("shorts"));
    assert.ok(recommendation.running.mainRun.includes("t_shirt"));
    assert.equal(recommendation.running.hydrationReminder, true);
  });

  it("warns when the return-home forecast is meaningfully colder", () => {
    const recommendation = createRecommendation(
      createInput({
        current: createWeather({ feelsLikeC: 16 }),
        forecastAtReturn: createWeather({ feelsLikeC: 7, time: "2026-06-05T21:00" }),
      }),
    );

    assert.ok(
      recommendation.riskWarnings.some((warning) => warning.type === "cold_later"),
    );
    assert.ok(recommendation.running?.postRun.includes("light_jacket"));
  });

  it("does not return running phases for everyday plans", () => {
    const recommendation = createRecommendation(
      createInput({
        activity: { mode: "everyday", durationMinutes: 45 },
      }),
    );

    assert.equal(recommendation.activityMode, "everyday");
    assert.equal(recommendation.running, undefined);
    assert.ok(recommendation.outfit.length > 0);
  });

  it("uses comfort offset to move recommendations warmer after cold feedback", () => {
    const recommendation = createRecommendation(
      createInput({
        current: createWeather({ feelsLikeC: 18 }),
        personalization: { temperatureOffsetC: -8, ratedRecommendations: 8 },
      }),
    );

    assert.ok(recommendation.outfit.includes("long_pants"));
    assert.ok(recommendation.outfit.includes("long_sleeve"));
  });
});

function createInput(
  overrides: Partial<RecommendationInput> & {
    activity?: Partial<RecommendationInput["activity"]>;
    personalization?: Partial<RecommendationInput["personalization"]>;
  } = {},
): RecommendationInput {
  const current = overrides.current ?? createWeather();

  return {
    current,
    forecastAtFinish: overrides.forecastAtFinish ?? current,
    forecastAtReturn: overrides.forecastAtReturn ?? current,
    activity: {
      mode: "running",
      startTime: "2026-06-05T18:00",
      durationMinutes: 45,
      returnHomeTime: "2026-06-05T19:30",
      intensity: "medium",
      ...overrides.activity,
    },
    personalization: {
      starterProfile: "standard",
      ratedRecommendations: 3,
      temperatureOffsetC: 0,
      ...overrides.personalization,
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
    time: "2026-06-05T18:00",
    locationLabel: "Warsaw, Poland",
    ...overrides,
  };
}
