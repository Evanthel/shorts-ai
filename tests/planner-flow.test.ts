import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getMissingPlanFields,
  isPlanComplete,
  shouldAutoRevealRecommendation,
  type PlanCompletionInput,
} from "@shorts-ai/core";

const completeRun: PlanCompletionInput = {
  mode: "running",
  hasForecast: true,
  starterProfile: "standard",
  runningIntensity: "medium",
  commuteMode: null,
  hasOutdoorMinutes: false,
  canCarryLayer: null,
};

describe("mobile planner completion", () => {
  it("requires an explicit comfort profile and running intensity", () => {
    assert.deepEqual(getMissingPlanFields({
      ...completeRun,
      starterProfile: null,
      runningIntensity: null,
    }), ["comfort profile", "intensity"]);
    assert.equal(isPlanComplete(completeRun), true);
  });

  it("requires every commute-specific answer while accepting a no carry choice", () => {
    const commute: PlanCompletionInput = {
      ...completeRun,
      mode: "commute",
      runningIntensity: null,
      commuteMode: "transit",
      hasOutdoorMinutes: true,
      canCarryLayer: false,
    };
    assert.equal(isPlanComplete(commute), true);
    assert.deepEqual(getMissingPlanFields({
      ...commute,
      commuteMode: null,
      hasOutdoorMinutes: false,
      canCarryLayer: null,
    }), ["commute mode", "outdoor time", "extra layer choice"]);
  });

  it("keeps walking completion limited to location and comfort profile", () => {
    assert.equal(isPlanComplete({
      ...completeRun,
      mode: "walking",
      runningIntensity: null,
    }), true);
  });

  it("auto-reveals only on the first incomplete-to-complete transition", () => {
    assert.equal(shouldAutoRevealRecommendation({ wasComplete: false, isComplete: true, hasRevealed: false }), true);
    assert.equal(shouldAutoRevealRecommendation({ wasComplete: true, isComplete: true, hasRevealed: false }), false);
    assert.equal(shouldAutoRevealRecommendation({ wasComplete: false, isComplete: true, hasRevealed: true }), false);
    assert.equal(shouldAutoRevealRecommendation({ wasComplete: false, isComplete: false, hasRevealed: false }), false);
  });
});
