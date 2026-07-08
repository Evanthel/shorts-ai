import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildRecommendationInput,
  createInitialPlannerForm,
  emptyFeedbackStats,
  formatClockTime,
  mergeClockTimeIntoDate,
  projectFeedbackStats,
  shiftPlannerStartTime,
  updatePlannerReturnClockTime,
  updatePlannerStartClockTime,
  updatePlannerDuration,
} from "@shorts-ai/core";
import type { LocationForecast, WeatherSnapshot } from "@shorts-ai/core";

describe("planner helpers", () => {
  it("creates a default running form with return time after the start", () => {
    const form = createInitialPlannerForm(new Date("2026-07-01T10:10:00"));

    assert.equal(form.mode, "running");
    assert.equal(form.startTime, "2026-07-01T11:00");
    assert.equal(form.returnHomeTime, "2026-07-01T12:30");
  });

  it("shifts return-home time by the same delta as start time", () => {
    const form = createInitialPlannerForm(new Date("2026-07-01T10:10:00"));
    const next = shiftPlannerStartTime(form, "2026-07-01T12:00");

    assert.equal(next.startTime, "2026-07-01T12:00");
    assert.equal(next.returnHomeTime, "2026-07-01T13:30");
  });

  it("updates duration and keeps return-home timing aligned", () => {
    const form = createInitialPlannerForm(new Date("2026-07-01T10:10:00"));
    const next = updatePlannerDuration(form, 60);

    assert.equal(next.durationMinutes, 60);
    assert.equal(next.returnHomeTime, "2026-07-01T12:45");
  });

  it("formats and merges clock-only input without exposing full dates in the UI", () => {
    assert.equal(formatClockTime("2026-07-01T13:05"), "13:05");
    assert.equal(
      mergeClockTimeIntoDate("2026-07-01T13:05", "16:30"),
      "2026-07-01T16:30",
    );
  });

  it("updates planner start and return from clock-only input", () => {
    const form = createInitialPlannerForm(new Date("2026-07-01T10:10:00"));
    const nextStart = updatePlannerStartClockTime(form, "13:00");
    const nextReturn = updatePlannerReturnClockTime(nextStart, "14:45");

    assert.equal(nextStart.startTime, "2026-07-01T13:00");
    assert.equal(nextStart.returnHomeTime, "2026-07-01T14:30");
    assert.equal(nextReturn.returnHomeTime, "2026-07-01T14:45");
  });

  it("builds recommendation input from closest forecast snapshots", () => {
    const form = {
      ...createInitialPlannerForm(new Date("2026-07-01T10:10:00")),
      startTime: "2026-07-01T11:05",
      durationMinutes: 55,
      returnHomeTime: "2026-07-01T13:05",
    };
    const input = buildRecommendationInput(form, createForecast(), 7, -1);

    assert.equal(input.current.time, "2026-07-01T11:00");
    assert.equal(input.forecastAtFinish.time, "2026-07-01T12:00");
    assert.equal(input.forecastAtReturn.time, "2026-07-01T13:00");
    assert.equal(input.personalization.temperatureOffsetC, -1);
  });

  it("projects feedback stats without mutating the current stats", () => {
    const current = emptyFeedbackStats();
    const next = projectFeedbackStats(current, "too_cold");

    assert.equal(current.total, 0);
    assert.equal(next.total, 1);
    assert.equal(next.tooCold, 1);
    assert.equal(next.dominantSignal, "too_cold");
  });
});

function createForecast(): LocationForecast {
  return {
    location: {
      id: 1,
      name: "Warsaw",
      country: "Poland",
      latitude: 52.23,
      longitude: 21.01,
      timezone: "Europe/Warsaw",
    },
    hourly: [
      createWeather({ time: "2026-07-01T11:00", feelsLikeC: 19 }),
      createWeather({ time: "2026-07-01T12:00", feelsLikeC: 21 }),
      createWeather({ time: "2026-07-01T13:00", feelsLikeC: 18 }),
    ],
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
    time: "2026-07-01T11:00",
    locationLabel: "Warsaw, Poland",
    ...overrides,
  };
}
