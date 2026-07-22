import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createRecommendationResult,
  type ActivityInput,
  type ClothingItem,
  type RecommendationInput,
  type StarterProfile,
  type WeatherSnapshot,
} from "@shorts-ai/core";

describe("characteristic weather scenarios", () => {
  it("keeps rain protection in every walking variant", () => {
    const result = createRecommendationResult(input({
      activity: activity("walking"),
      current: weather({ feelsLikeC: 15, rainProbabilityPercent: 80 }),
    }));
    assert.ok(result.variants.every((variant) => variant.outfit.includes("rain_jacket")));
  });

  it("keeps cold safety items in every transit variant", () => {
    const result = createRecommendationResult(input({
      activity: activity("commute", { mode: "transit", outdoorMinutes: 20, canCarryLayer: true }),
      current: weather({ temperatureC: 3, feelsLikeC: 2 }),
    }));
    const coldSafetyItems: ClothingItem[] = ["light_jacket", "gloves", "hat"];
    assert.ok(result.variants.every((variant) => coldSafetyItems.every((item) => variant.outfit.includes(item))));
  });

  it("accounts for bicycle body heat more than car travel", () => {
    const bicycle = createRecommendationResult(input({
      activity: activity("commute", { mode: "bicycle", outdoorMinutes: 35, canCarryLayer: true }),
      current: weather({ temperatureC: 15, feelsLikeC: 15 }),
    })).recommendation.outfit;
    const car = createRecommendationResult(input({
      activity: activity("commute", { mode: "car", outdoorMinutes: 5, canCarryLayer: false }),
      current: weather({ temperatureC: 15, feelsLikeC: 15 }),
    })).recommendation.outfit;
    assert.ok(bicycle.includes("shorts"));
    assert.ok(car.includes("long_pants"));
  });

  it("moves an always-cold profile warmer than a heat-sensitive profile", () => {
    const alwaysCold = outfitForProfile("always-cold");
    const heatSensitive = outfitForProfile("heat-sensitive");
    assert.ok(alwaysCold.includes("long_pants"));
    assert.ok(heatSensitive.includes("shorts"));
  });

  it("warns about a materially colder return", () => {
    const result = createRecommendationResult(input({
      current: weather({ feelsLikeC: 16 }),
      returned: weather({ temperatureC: 7, feelsLikeC: 6, time: "2026-10-10T22:00" }),
    }));
    assert.ok(result.recommendation.riskWarnings.some((warning) => warning.type === "cold_later"));
  });

  it("keeps a hot hard run light and flags overheating", () => {
    const result = createRecommendationResult(input({
      activity: activity("running", undefined, "hard"),
      current: weather({ temperatureC: 29, feelsLikeC: 31, humidityPercent: 80 }),
    }));
    assert.ok(result.recommendation.running?.mainRun.includes("shorts"));
    assert.ok(result.recommendation.riskWarnings.some((warning) => warning.type === "overheating"));
  });
});

function outfitForProfile(starterProfile: StarterProfile) {
  return createRecommendationResult(input({
    current: weather({ feelsLikeC: 17 }),
    starterProfile,
  })).recommendation.outfit;
}

function activity(
  mode: ActivityInput["mode"],
  commute?: NonNullable<ActivityInput["commute"]>,
  intensity: ActivityInput["intensity"] = "medium",
): ActivityInput {
  return {
    mode,
    startTime: "2026-10-10T17:00",
    durationMinutes: 60,
    returnHomeTime: "2026-10-10T20:00",
    ...(mode === "running" ? { intensity } : {}),
    ...(mode === "commute" ? { commute } : {}),
  };
}

function input({
  activity: nextActivity = activity("running"),
  current = weather(),
  returned,
  starterProfile = "standard",
}: {
  activity?: ActivityInput;
  current?: WeatherSnapshot;
  returned?: WeatherSnapshot;
  starterProfile?: StarterProfile;
} = {}): RecommendationInput {
  return {
    current,
    forecastAtFinish: current,
    forecastAtReturn: returned ?? current,
    activity: nextActivity,
    personalization: { starterProfile, ratedRecommendations: 0 },
  };
}

function weather(overrides: Partial<WeatherSnapshot> = {}): WeatherSnapshot {
  return {
    temperatureC: 18,
    feelsLikeC: 18,
    windKph: 10,
    humidityPercent: 55,
    rainProbabilityPercent: 10,
    uvIndex: 2,
    time: "2026-10-10T17:00",
    locationLabel: "Test location",
    ...overrides,
  };
}
