import type { FollowUpIntent } from "./domain";
import {
  createFallbackExplanation,
  type ExplanationRequest,
  type ExplanationResponse,
} from "./explanation";

export async function withExplanationFallback(
  payload: ExplanationRequest,
  request: () => Promise<ExplanationResponse>,
): Promise<ExplanationResponse> {
  try {
    return await request();
  } catch {
    return createExplanationFallbackResponse(payload);
  }
}

export function createExplanationFallbackResponse(
  payload: ExplanationRequest,
): ExplanationResponse {
  const intent = payload.intent ?? "why_outfit";

  return {
    explanation: createFallbackExplanation(payload),
    source: "fallback",
    scope: intent === "out_of_scope" ? "out_of_scope" : "in_scope",
    intent,
    action: actionForIntent(intent),
  };
}

function actionForIntent(intent: FollowUpIntent): "explain" | "recalculate" | "refuse" {
  if (intent === "out_of_scope") return "refuse";
  if (intent === "adjust_warmer" || intent === "adjust_lighter" || intent === "avoid_item") {
    return "recalculate";
  }
  return "explain";
}
