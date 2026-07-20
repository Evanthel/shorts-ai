import type { ExplanationRequest, ExplanationResponse } from "@shorts-ai/core";
import { createFallbackExplanation } from "@shorts-ai/core";
import { mobileEnv } from "../lib/env";
import { createMobileSupabaseClient, isSupabaseConfigured } from "../lib/supabase";

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

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (isSupabaseConfigured()) {
      const { data } = await createMobileSupabaseClient().auth.getSession();
      if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
    }
    const response = await fetch(`${mobileEnv.apiBaseUrl}/api/explain`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error("Explanation request failed.");
    return (await response.json()) as ExplanationResponse;
  } catch {
    return {
      explanation: createFallbackExplanation(payload),
      source: "fallback",
      scope: "in_scope",
      ...(payload.intent ? { intent: payload.intent } : {}),
      action: "explain",
    };
  }
}
