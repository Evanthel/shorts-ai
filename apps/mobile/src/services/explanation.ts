import type { ExplanationRequest, ExplanationResponse } from "@shorts-ai/core";
import { withExplanationFallback } from "@shorts-ai/core";
import { mobileEnv } from "../lib/env";
import { createMobileSupabaseClient, isSupabaseConfigured } from "../lib/supabase";

export async function requestMobileExplanation(
  payload: ExplanationRequest,
): Promise<ExplanationResponse> {
  return withExplanationFallback(payload, async () => {
    if (!mobileEnv.apiBaseUrl) throw new Error("Mobile API is not configured.");
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
  });
}
