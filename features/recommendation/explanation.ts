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
  limit?: {
    exceeded?: boolean;
    remaining?: number;
    resetAt: string;
  };
};

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

export function createFallbackExplanation({
  input,
  recommendation,
  question,
}: ExplanationRequest) {
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
