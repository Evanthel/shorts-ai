export {
  createFallbackExplanation,
  createOutOfScopeExplanation,
  isFollowUpInScope,
  type ExplanationRequest,
  type ExplanationResponse,
} from "@shorts-ai/core";

import type { ExplanationRequest, ExplanationResponse } from "@shorts-ai/core";
import { withExplanationFallback } from "@shorts-ai/core";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

export async function requestExplanation(
  payload: ExplanationRequest,
): Promise<ExplanationResponse> {
  return withExplanationFallback(payload, async () => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (isSupabaseConfigured()) {
      const { data } = await createBrowserSupabaseClient().auth.getSession();
      if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
    }
    const response = await fetch("/api/explain", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error("Explanation request failed.");

    return (await response.json()) as ExplanationResponse;
  });
}
