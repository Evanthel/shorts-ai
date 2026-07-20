import {
  createRecommendationResult,
  type RecommendationRequest,
  type RecommendationResult,
} from "@shorts-ai/core";
import { mobileEnv } from "../lib/env";
import { createMobileSupabaseClient, isSupabaseConfigured } from "../lib/supabase";

export async function requestMobileRecommendation(payload: RecommendationRequest) {
  if (!mobileEnv.apiBaseUrl) return createRecommendationResult(payload.input, payload.constraints);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isSupabaseConfigured()) {
    const { data } = await createMobileSupabaseClient().auth.getSession();
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  try {
    const response = await fetch(`${mobileEnv.apiBaseUrl.replace(/\/$/, "")}/api/recommend`, {
      method: "POST", headers, body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("Recommendation API failed.");
    return await response.json() as RecommendationResult;
  } catch {
    return createRecommendationResult(payload.input, payload.constraints);
  }
}
