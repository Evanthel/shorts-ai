import type {
  ActivityMode,
  ClothingItem,
  FollowUpIntent,
  Recommendation,
  RecommendationInput,
  RecommendationResult,
} from "./domain";
import { starterProfiles } from "./recommendation/profiles";

export type FollowUpSource = "shortcut" | "text";

export type ClassifiedFollowUp = {
  intent: FollowUpIntent;
  avoidedItem?: ClothingItem;
};

export type ExplanationRequest = {
  input: RecommendationInput;
  recommendation: Recommendation;
  recommendationResult?: RecommendationResult;
  recommendationId?: string;
  intent?: FollowUpIntent;
  source?: FollowUpSource;
  question?: string;
};

export type ExplanationResponse = {
  explanation: string;
  source: "openrouter" | "fallback" | "deterministic";
  scope?: "in_scope" | "out_of_scope";
  intent?: FollowUpIntent;
  action?: "explain" | "recalculate" | "refuse";
  recommendationResult?: RecommendationResult;
  limit?: {
    exceeded?: boolean;
    remaining?: number;
    resetAt: string;
  };
};

export const followUpIntents = [
  "why_outfit",
  "overheating",
  "rain_wind",
  "return_conditions",
  "carry_layer",
  "indoor_outdoor",
  "adjust_warmer",
  "adjust_lighter",
  "avoid_item",
  "item_question",
  "out_of_scope",
] as const satisfies readonly FollowUpIntent[];

export const shortcutQuestions: Record<ActivityMode, Array<{ label: string; intent: FollowUpIntent }>> = {
  running: [
    { label: "Will I overheat?", intent: "overheating" },
    { label: "What changes during the run?", intent: "indoor_outdoor" },
    { label: "What about rain and wind?", intent: "rain_wind" },
    { label: "What should I carry for the return?", intent: "carry_layer" },
  ],
  commute: [
    { label: "Will I be cold on the return?", intent: "return_conditions" },
    { label: "Do I need rain protection?", intent: "rain_wind" },
    { label: "Which layer can I remove?", intent: "adjust_lighter" },
    { label: "Can I carry the extra layer comfortably?", intent: "carry_layer" },
  ],
  walking: [
    { label: "How will conditions change?", intent: "return_conditions" },
    { label: "Do I need rain protection?", intent: "rain_wind" },
    { label: "Will I overheat?", intent: "overheating" },
    { label: "What should I carry for the return?", intent: "carry_layer" },
  ],
};

const outOfScopeExplanation =
  "I can only help with this plan's weather, activity, outfit, and safe warmer or lighter adjustments.";

export function isFollowUpIntent(value: unknown): value is FollowUpIntent {
  return typeof value === "string" && (followUpIntents as readonly string[]).includes(value);
}

export function isFollowUpInScope(_question?: string, intent?: FollowUpIntent) {
  return intent !== "out_of_scope";
}

export function createOutOfScopeExplanation() {
  return outOfScopeExplanation;
}

export function createIntentExplanation({
  input,
  recommendation,
  intent = "why_outfit",
}: ExplanationRequest) {
  if (intent === "out_of_scope") return createOutOfScopeExplanation();

  const start = input.current.feelsLikeC;
  const finish = input.forecastAtFinish.feelsLikeC;
  const returned = input.forecastAtReturn.feelsLikeC;
  const warning = (type: Recommendation["riskWarnings"][number]["type"]) =>
    recommendation.riskWarnings.find((item) => item.type === type)?.message;

  if (intent === "overheating") {
    return warning("overheating") ??
      `The plan starts at ${start} C feels-like. The ${formatItems(recommendation.outfit)} combination is balanced for the selected activity load; choose the lighter safe variant if you usually run warm.`;
  }
  if (intent === "rain_wind") {
    const details = [warning("rain_likely"), warning("strong_wind")].filter(Boolean);
    return details.length > 0
      ? details.join(" ")
      : "No significant rain or wind risk is present in the current plan window.";
  }
  if (intent === "return_conditions") {
    const delta = returned - start;
    return `It feels like ${start} C at the start, ${finish} C near the finish, and ${returned} C on return (${formatSigned(delta)} C versus the start).`;
  }
  if (intent === "carry_layer") {
    const canCarry = input.activity.commute?.canCarryLayer;
    const needsCarry = recommendation.running?.carryExtraLayer || returned < start - 3;
    if (canCarry === false && needsCarry) {
      return "A return layer is useful, but you marked that you cannot carry one. Keep the required safety items and use the standard variant.";
    }
    return needsCarry
      ? "Carry the return layer and put it on after the active part of the plan. Required safety items should stay with you throughout."
      : "The return forecast does not require a separate carried layer beyond the selected outfit.";
  }
  if (intent === "indoor_outdoor") {
    return recommendation.running
      ? `Use ${formatItems(recommendation.running.warmUp)} at the start, ${formatItems(recommendation.running.mainRun)} during the run, and ${formatItems(recommendation.running.postRun)} after it.`
      : "Remove a non-required outer layer indoors if needed, then restore it before returning outside.";
  }
  if (intent === "adjust_warmer") return "I recalculated the plan with the warmer safe variant. Safety-required items remain fixed.";
  if (intent === "adjust_lighter") return "I recalculated the plan with the lighter safe variant. Safety-required items remain fixed.";
  if (intent === "avoid_item") return "I recalculated the candidates without that item where safety permits. Required items cannot be removed.";
  if (intent === "item_question") return `The selected outfit is ${formatItems(recommendation.outfit)}. Each item follows the activity load, comfort memory, and weather window.`;

  const profile = starterProfiles[input.personalization.starterProfile].label.toLowerCase();
  return `This ${input.activity.mode} recommendation uses the ${profile} profile. ${recommendation.headline} It compares start, finish, and return conditions before applying safety requirements.`;
}

export function createFallbackExplanation(request: ExplanationRequest) {
  return createIntentExplanation(request);
}

function formatItems(items: ClothingItem[]) {
  return items.map((item) => item.replaceAll("_", " ")).join(", ");
}

function formatSigned(value: number) {
  return `${value > 0 ? "+" : ""}${Math.round(value * 10) / 10}`;
}
