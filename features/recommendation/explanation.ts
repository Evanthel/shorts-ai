import type { Recommendation, RecommendationInput } from "@/types/domain";
import { starterProfiles } from "./profiles";

export type ExplanationRequest = {
  input: RecommendationInput;
  recommendation: Recommendation;
  question?: string;
};

export type ExplanationResponse = {
  explanation: string;
  source: "openrouter" | "fallback";
  scope?: "in_scope" | "out_of_scope";
  limit?: {
    exceeded?: boolean;
    remaining?: number;
    resetAt: string;
  };
};

const inScopeFollowUpTerms = [
  "activity",
  "commute",
  "cold",
  "cool",
  "forecast",
  "glove",
  "hat",
  "heat",
  "hoodie",
  "humidity",
  "jacket",
  "layer",
  "pants",
  "rain",
  "recommendation",
  "run",
  "running",
  "shirt",
  "shoe",
  "shorts",
  "sleeve",
  "temperature",
  "visibility",
  "walk",
  "walking",
  "warm",
  "weather",
  "wind",
  "workout",
];

const outOfScopeExplanation =
  "I can only answer follow-up questions about this plan's weather, activity, outfit, running, walking, commute, and the current recommendation.";

export async function requestExplanation(
  payload: ExplanationRequest,
): Promise<ExplanationResponse> {
  const response = await fetch("/api/explain", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Explanation request failed.");
  }

  return (await response.json()) as ExplanationResponse;
}

export function isFollowUpInScope(question?: string) {
  const normalized = question?.trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  const words = normalized.match(/[a-z]+/g) ?? [];

  return inScopeFollowUpTerms.some((term) =>
    words.some(
      (word) =>
        word === term ||
        word === `${term}s` ||
        (term.length >= 4 && word.startsWith(term)),
    ),
  );
}

export function createOutOfScopeExplanation() {
  return outOfScopeExplanation;
}

export function createFallbackExplanation({
  input,
  recommendation,
  question,
}: ExplanationRequest) {
  if (!isFollowUpInScope(question)) {
    return createOutOfScopeExplanation();
  }

  const activityLabel = getActivityExplanationLabel(input.activity.mode);
  const profileLabel = starterProfiles[input.personalization.starterProfile].label;
  const riskText =
    recommendation.riskWarnings.length > 0
      ? recommendation.riskWarnings.map((warning) => warning.message).join(" ")
      : "No major weather risks were detected for this plan window.";

  return [
    question ? `For "${question}", use the existing recommendation rather than changing the outfit.` : "",
    `This is a ${activityLabel} recommendation using the ${profileLabel.toLowerCase()} profile.`,
    recommendation.headline,
    `At the start it feels like ${input.current.feelsLikeC} C, while the return-home forecast feels like ${input.forecastAtReturn.feelsLikeC} C.`,
    riskText,
  ].filter(Boolean).join(" ");
}

function getActivityExplanationLabel(mode: RecommendationInput["activity"]["mode"]) {
  if (mode === "running") {
    return "run";
  }

  if (mode === "walking") {
    return "walk";
  }

  return "standard commute/everyday";
}
