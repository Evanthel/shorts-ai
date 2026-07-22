import type {
  ActivityMode,
  CommuteMode,
  RunningIntensity,
  StarterProfile,
} from "./domain";

export type MissingPlanField =
  | "location"
  | "comfort profile"
  | "intensity"
  | "commute mode"
  | "outdoor time"
  | "extra layer choice";

export type PlanCompletionInput = {
  mode: ActivityMode;
  hasForecast: boolean;
  starterProfile: StarterProfile | null;
  runningIntensity: RunningIntensity | null;
  commuteMode: CommuteMode | null;
  hasOutdoorMinutes: boolean;
  canCarryLayer: boolean | null;
};

export function getMissingPlanFields(input: PlanCompletionInput): MissingPlanField[] {
  const missing: Array<MissingPlanField | null> = [
    input.hasForecast ? null : "location",
    input.starterProfile ? null : "comfort profile",
    input.mode === "running" && !input.runningIntensity ? "intensity" : null,
    input.mode === "commute" && !input.commuteMode ? "commute mode" : null,
    input.mode === "commute" && !input.hasOutdoorMinutes ? "outdoor time" : null,
    input.mode === "commute" && input.canCarryLayer === null ? "extra layer choice" : null,
  ];

  return missing.filter((field): field is MissingPlanField => field !== null);
}

export function isPlanComplete(input: PlanCompletionInput) {
  return getMissingPlanFields(input).length === 0;
}

export function shouldAutoRevealRecommendation({
  wasComplete,
  isComplete,
  hasRevealed,
}: {
  wasComplete: boolean;
  isComplete: boolean;
  hasRevealed: boolean;
}) {
  return !wasComplete && isComplete && !hasRevealed;
}
