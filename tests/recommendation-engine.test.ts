import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRecommendation, createRecommendationResult } from "@shorts-ai/core";
import type { ActivityInput, PersonalizationInput, RecommendationInput, WeatherSnapshot } from "@shorts-ai/core";

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

  it("does not return running phases for commute plans", () => {
    const recommendation = createRecommendation(
      createInput({
        activity: {
          mode: "commute",
          durationMinutes: 45,
          commute: { mode: "transit", outdoorMinutes: 20, canCarryLayer: true },
        },
      }),
    );

    assert.equal(recommendation.activityMode, "commute");
    assert.equal(recommendation.running, undefined);
    assert.ok(recommendation.outfit.length > 0);
  });

  it("uses comfort offset to move recommendations warmer after cold feedback", () => {
    const recommendation = createRecommendation(
      createInput({
        current: createWeather({ feelsLikeC: 18 }),
        personalization: { temperatureOffsetC: -4, ratedRecommendations: 8 },
      }),
    );

    assert.ok(recommendation.outfit.includes("long_pants"));
    assert.ok(recommendation.outfit.includes("long_sleeve"));
  });

  it("creates thermally ordered variants and removes duplicates", () => {
    const threshold = createRecommendationResult(createInput({ current: createWeather({ feelsLikeC: 17 }) }));
    assert.equal(threshold.variants[0].kind, "standard");
    assert.ok(threshold.variants.some((variant) => variant.kind === "lighter"));
    assert.ok(threshold.variants.some((variant) => variant.kind === "warmer"));

    const stableHot = createRecommendationResult(createInput({ current: createWeather({ temperatureC: 28, feelsLikeC: 28 }) }));
    assert.equal(stableHot.variants.length, 1);
  });

  it("keeps safety-required rain and cold items in every candidate", () => {
    const result = createRecommendationResult(createInput({
      current: createWeather({ feelsLikeC: 4, rainProbabilityPercent: 80 }),
      forecastAtFinish: createWeather({ feelsLikeC: 3, rainProbabilityPercent: 80 }),
      forecastAtReturn: createWeather({ feelsLikeC: 2, rainProbabilityPercent: 80 }),
    }), { avoidedItems: ["rain_jacket", "gloves", "hat"] });

    for (const variant of result.variants) {
      assert.deepEqual(variant.requiredItems.sort(), ["gloves", "hat", "light_jacket", "rain_jacket"].sort());
      for (const required of variant.requiredItems) assert.ok(variant.outfit.includes(required));
    }
  });
});

type InputOverrides = {
  current?: WeatherSnapshot;
  forecastAtFinish?: WeatherSnapshot;
  forecastAtReturn?: WeatherSnapshot;
  activity?: Partial<ActivityInput>;
  personalization?: Partial<PersonalizationInput>;
};

function createInput(overrides: InputOverrides = {}): RecommendationInput {
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
