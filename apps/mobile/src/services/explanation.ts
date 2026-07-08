import type { ExplanationRequest, ExplanationResponse } from "@shorts-ai/core";
import { createFallbackExplanation } from "@shorts-ai/core";
import { mobileEnv } from "../lib/env";

export async function requestMobileExplanation(
  payload: ExplanationRequest,
): Promise<ExplanationResponse> {
  if (!mobileEnv.apiBaseUrl) {
    return {
      explanation: createFallbackExplanation(payload),
      source: "fallback",
      scope: "in_scope",
    };
  }

  const response = await fetch(`${mobileEnv.apiBaseUrl.replace(/\/$/, "")}/api/explain`, {
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
