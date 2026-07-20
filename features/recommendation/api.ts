import {
  createRecommendationResult,
  type RecommendationRequest,
  type RecommendationResult,
} from "@shorts-ai/core";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

export async function requestRecommendation(payload: RecommendationRequest) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isSupabaseConfigured()) {
    const { data } = await createBrowserSupabaseClient().auth.getSession();
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  try {
    const response = await fetch("/api/recommend", { method: "POST", headers, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error("Recommendation API failed.");
    return await response.json() as RecommendationResult;
  } catch {
    return createRecommendationResult(payload.input, payload.constraints);
  }
}
