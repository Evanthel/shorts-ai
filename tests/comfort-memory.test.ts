import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getContextTemperatureOffset,
  normalizeActivityMode,
  updateComfortMemory,
} from "@shorts-ai/core";
import type { ActivityInput, CommuteMode } from "@shorts-ai/core";

describe("contextual comfort memory", () => {
  it("updates only the relevant activity context by half a degree", () => {
    const running = activity("running");
    const commute = activity("commute", "transit");
    const memory = updateComfortMemory(undefined, running, "too_cold");

    assert.equal(getContextTemperatureOffset(running, memory, 2), -0.5);
    assert.equal(getContextTemperatureOffset(commute, memory, 2), 2);
  });

  it("clamps every context to plus or minus four degrees", () => {
    const running = activity("running");
    let memory = {};
    for (let index = 0; index < 20; index += 1) memory = updateComfortMemory(memory, running, "too_warm");
    assert.equal(getContextTemperatureOffset(running, memory), 4);
    for (let index = 0; index < 30; index += 1) memory = updateComfortMemory(memory, running, "too_cold");
    assert.equal(getContextTemperatureOffset(running, memory), -4);
  });

  it("normalizes legacy everyday history without exposing it as a new mode", () => {
    assert.equal(normalizeActivityMode("everyday"), "commute");
    assert.equal(normalizeActivityMode("walking"), "walking");
  });

  it("supports every commute subtype independently", () => {
    for (const mode of ["walking", "transit", "bicycle", "car"] as const) {
      const commute = activity("commute", mode);
      const memory = updateComfortMemory(undefined, commute, "too_warm");
      assert.equal(getContextTemperatureOffset(commute, memory), 0.5);
    }
  });
});

function activity(mode: "running" | "walking" | "commute", commuteMode: CommuteMode = "walking"): ActivityInput {
  return {
    mode,
    startTime: "2026-07-19T10:00",
    returnHomeTime: "2026-07-19T11:00",
    durationMinutes: 45,
    ...(mode === "running" ? { intensity: "medium" as const } : {}),
    ...(mode === "commute" ? { commute: { mode: commuteMode, outdoorMinutes: 20, canCarryLayer: true } } : {}),
  };
}
