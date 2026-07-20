import type { User } from "@supabase/supabase-js";
import type {
  ActivityMode,
  ComfortMemory,
  FeedbackSubmission,
  FeedbackRating,
  FeedbackStats,
  GeoLocation,
  Recommendation,
  RecommendationInput,
  RecommendationResult,
  StarterProfile,
} from "@shorts-ai/core";
import {
  createFeedbackStats,
  emptyFeedbackStats,
  formatLocationLabel,
  normalizeActivityMode,
  normalizeComfortMemory,
  normalizeStarterProfile,
  getFeedbackDueAt,
} from "@shorts-ai/core";
import { createMobileSupabaseClient, isSupabaseConfigured } from "../lib/supabase";

export type ProfileMemory = {
  starterProfile: StarterProfile;
  personalizationScore: number;
  temperatureOffsetC: number;
  ratedRecommendations: number;
  comfortSummary: string | null;
  comfortMemory: ComfortMemory;
};

export type RecommendationHistoryItem = {
  id: string;
  locationLabel: string;
  activityMode: ActivityMode;
  confidenceScore: number;
  headline: string;
  createdAtInput?: string;
  returnHomeTime?: string;
  outfitSummary: string;
  createdAt: string;
  acceptedAt?: string;
  feedbackDueAt?: string;
};

export type FavouriteLocation = GeoLocation & {
  favouriteId: string;
};

export type { FeedbackStats } from "@shorts-ai/core";

export async function loadProfileMemory(user: User): Promise<ProfileMemory | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createMobileSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "starter_profile, personalization_score, temperature_offset_c, comfort_memory, rated_recommendations, comfort_summary",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    starterProfile: normalizeStarterProfile(data.starter_profile),
    personalizationScore: data.personalization_score,
    temperatureOffsetC: Number(data.temperature_offset_c),
    ratedRecommendations: data.rated_recommendations,
    comfortSummary: data.comfort_summary,
    comfortMemory: normalizeComfortMemory(data.comfort_memory),
  };
}

export async function ensureProfile(user: User, input: RecommendationInput) {
  if (!isSupabaseConfigured()) {
    return;
  }

  const supabase = createMobileSupabaseClient();

  await supabase.from("profiles").upsert({
    id: user.id,
    starter_profile: input.personalization.starterProfile,
    personalization_score: Math.min(
      100,
      Math.round((input.personalization.ratedRecommendations / 15) * 100),
    ),
    temperature_offset_c: input.personalization.temperatureOffsetC ?? 0,
    comfort_memory: input.personalization.comfortMemory ?? {},
    rated_recommendations: input.personalization.ratedRecommendations,
    updated_at: new Date().toISOString(),
  });
}

export async function saveProfileMemory(
  user: User,
  memory: Omit<ProfileMemory, "personalizationScore" | "comfortSummary"> & {
    comfortSummary?: string | null;
  },
) {
  if (!isSupabaseConfigured()) {
    return;
  }

  const supabase = createMobileSupabaseClient();
  const ratedRecommendations = memory.ratedRecommendations;
  const comfortSummary = ratedRecommendations >= 15 ? memory.comfortSummary ?? null : null;

  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    starter_profile: memory.starterProfile,
    personalization_score: Math.min(100, Math.round((ratedRecommendations / 15) * 100)),
    temperature_offset_c: memory.temperatureOffsetC,
    comfort_memory: memory.comfortMemory,
    rated_recommendations: ratedRecommendations,
    comfort_summary: comfortSummary,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw error;
  }
}

export async function loadFeedbackStats(user: User | null): Promise<FeedbackStats> {
  if (!user || !isSupabaseConfigured()) {
    return emptyFeedbackStats();
  }

  const supabase = createMobileSupabaseClient();
  const { data, error } = await supabase
    .from("feedback")
    .select("rating")
    .eq("user_id", user.id)
    .limit(250);

  if (error) {
    throw error;
  }

  return createFeedbackStats((data ?? []).map((item) => item.rating as FeedbackRating));
}

export async function resetProfileMemory(user: User | null, starterProfile: StarterProfile) {
  if (!user || !isSupabaseConfigured()) {
    return;
  }

  const supabase = createMobileSupabaseClient();
  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    starter_profile: starterProfile,
    personalization_score: 0,
    temperature_offset_c: 0,
    comfort_memory: {},
    rated_recommendations: 0,
    comfort_summary: null,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw error;
  }
}

export async function saveRecommendationExposure(
  user: User | null,
  clientRequestId: string,
  input: RecommendationInput | null,
  result: RecommendationResult | null,
) {
  if (!user || !input || !result || !isSupabaseConfigured()) return null;
  const supabase = createMobileSupabaseClient();
  await ensureProfile(user, input);
  const { data, error } = await supabase.from("recommendations").upsert({
    user_id: user.id,
    client_request_id: clientRequestId,
    location_label: input.current.locationLabel,
    activity_mode: input.activity.mode,
    weather_snapshot: input.current,
    forecast_snapshot: { finish: input.forecastAtFinish, returnHome: input.forecastAtReturn },
    recommendation_payload: { ...result, activity: input.activity, comfortMemory: input.personalization.comfortMemory ?? {}, contextTemperatureOffsetC: input.personalization.temperatureOffsetC ?? 0 },
    confidence_score: result.recommendation.confidenceScore,
    explanation: result.recommendation.explanationFacts.join(" "),
    engine_version: result.engineVersion,
    safety_policy_version: result.safetyPolicyVersion,
    model_version: result.modelVersion ?? null,
    source: result.source,
    selected_variant_id: result.selectedVariantId,
  }, { onConflict: "client_request_id" }).select("id").single();
  if (error) throw error;
  const { error: candidateError } = await supabase.from("recommendation_candidates").upsert(
    result.variants.map((variant, index) => ({
      recommendation_id: data.id,
      user_id: user.id,
      variant_id: variant.id,
      variant_kind: variant.kind,
      rank: index + 1,
      candidate_payload: variant,
      model_score: variant.modelScore ?? null,
      selected: variant.id === result.selectedVariantId,
    })),
    { onConflict: "recommendation_id,variant_id" },
  );
  if (candidateError) throw candidateError;
  return data.id;
}

export async function acceptRecommendation(
  user: User | null,
  recommendationId: string | null,
  selectedVariantId: string,
  returnHomeTime: string,
) {
  const dueAt = getFeedbackDueAt(returnHomeTime);
  if (!user || !recommendationId || !isSupabaseConfigured()) return dueAt;
  const supabase = createMobileSupabaseClient();
  const { error } = await supabase.from("recommendations").update({
    selected_variant_id: selectedVariantId,
    accepted_at: new Date().toISOString(),
    feedback_due_at: dueAt,
  }).eq("id", recommendationId).eq("user_id", user.id);
  if (error) throw error;
  await supabase.from("recommendation_candidates").update({ selected: false })
    .eq("recommendation_id", recommendationId).eq("user_id", user.id);
  const { error: selectedError } = await supabase.from("recommendation_candidates")
    .update({ selected: true }).eq("recommendation_id", recommendationId)
    .eq("user_id", user.id).eq("variant_id", selectedVariantId);
  if (selectedError) throw selectedError;
  return dueAt;
}

export async function selectRecommendationVariant(
  user: User | null,
  recommendationId: string | null,
  variantId: string,
) {
  if (!user || !recommendationId || !isSupabaseConfigured()) return;
  const supabase = createMobileSupabaseClient();
  const { error } = await supabase.from("recommendations")
    .update({ selected_variant_id: variantId }).eq("id", recommendationId).eq("user_id", user.id);
  if (error) throw error;
  await supabase.from("recommendation_candidates").update({ selected: false })
    .eq("recommendation_id", recommendationId).eq("user_id", user.id);
  const { error: candidateError } = await supabase.from("recommendation_candidates")
    .update({ selected: true }).eq("recommendation_id", recommendationId)
    .eq("user_id", user.id).eq("variant_id", variantId);
  if (candidateError) throw candidateError;
}

export async function saveFeedback(
  user: User | null,
  recommendationId: string | null,
  feedback: FeedbackSubmission,
) {
  if (!user || !recommendationId || !isSupabaseConfigured()) {
    return;
  }

  const supabase = createMobileSupabaseClient();
  const submission = feedback;
  const { error } = await supabase.from("feedback").upsert({
    user_id: user.id,
    recommendation_id: recommendationId,
    rating: submission.rating,
    actually_worn: submission.actuallyWorn,
    adjustment: submission.adjustment,
    problem_areas: submission.problemAreas,
    source: submission.source,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,recommendation_id" });

  if (error) {
    throw error;
  }
}

export async function loadRecommendationHistory(
  user: User | null,
  limit = 5,
): Promise<RecommendationHistoryItem[]> {
  if (!user || !isSupabaseConfigured()) {
    return [];
  }

  const supabase = createMobileSupabaseClient();
  const { data, error } = await supabase
    .from("recommendations")
    .select("id, location_label, activity_mode, confidence_score, recommendation_payload, accepted_at, feedback_due_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []).map((item) => {
    const recommendation = item.recommendation_payload as Partial<Recommendation>;

    return {
      id: item.id,
      locationLabel: item.location_label,
      activityMode: normalizeActivityMode(item.activity_mode),
      confidenceScore: item.confidence_score,
      headline: recommendation.headline ?? "Saved recommendation",
      createdAtInput: recommendationInputFromPayload(item.recommendation_payload, "startTime"),
      returnHomeTime: recommendationInputFromPayload(item.recommendation_payload, "returnHomeTime"),
      outfitSummary: Array.isArray(recommendation.outfit)
        ? recommendation.outfit.join(", ").replaceAll("_", " ")
        : "Saved outfit",
      createdAt: item.created_at,
      acceptedAt: item.accepted_at ?? undefined,
      feedbackDueAt: item.feedback_due_at ?? undefined,
    };
  });
}

export async function loadPendingFeedback(user: User | null) {
  if (!user || !isSupabaseConfigured()) return [];
  const supabase = createMobileSupabaseClient();
  const [{ data: accepted, error }, { data: feedbackRows, error: feedbackError }] = await Promise.all([
    supabase.from("recommendations")
      .select("id, location_label, activity_mode, recommendation_payload, feedback_due_at")
      .eq("user_id", user.id).not("accepted_at", "is", null).order("feedback_due_at", { ascending: false }).limit(20),
    supabase.from("feedback").select("recommendation_id").eq("user_id", user.id).limit(250),
  ]);
  if (error) throw error;
  if (feedbackError) throw feedbackError;
  const completed = new Set((feedbackRows ?? []).map((row) => row.recommendation_id));
  return (accepted ?? []).filter((item) => !completed.has(item.id)).map((item) => ({
    id: item.id,
    locationLabel: item.location_label,
    activityMode: normalizeActivityMode(item.activity_mode),
    feedbackDueAt: item.feedback_due_at,
    recommendation: item.recommendation_payload,
  }));
}

export async function loadFavouriteLocations(user: User | null): Promise<FavouriteLocation[]> {
  if (!user || !isSupabaseConfigured()) {
    return [];
  }

  const supabase = createMobileSupabaseClient();
  const { data, error } = await supabase
    .from("favourite_locations")
    .select("id, label, latitude, longitude, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(6);

  if (error) {
    throw error;
  }

  return (data ?? []).map((location) => ({
    favouriteId: location.id,
    id: Number.parseInt(location.id.slice(0, 8), 16) || location.label.length,
    name: location.label,
    country: "",
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    timezone: "auto",
  }));
}

export async function saveFavouriteLocation(
  user: User | null,
  location: GeoLocation | null,
) {
  if (!user || !location || !isSupabaseConfigured()) {
    return null;
  }

  const supabase = createMobileSupabaseClient();
  const label = formatLocationLabel(location);
  const existing = await supabase
    .from("favourite_locations")
    .select("id")
    .eq("user_id", user.id)
    .eq("label", label)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  if (existing.data?.id) {
    return existing.data.id;
  }

  const { data, error } = await supabase
    .from("favourite_locations")
    .insert({
      user_id: user.id,
      label,
      latitude: location.latitude,
      longitude: location.longitude,
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data.id;
}

export async function deleteFavouriteLocation(user: User | null, favouriteId: string) {
  if (!user || !isSupabaseConfigured()) {
    return;
  }

  const supabase = createMobileSupabaseClient();
  const { error } = await supabase
    .from("favourite_locations")
    .delete()
    .eq("id", favouriteId)
    .eq("user_id", user.id);

  if (error) {
    throw error;
  }
}

function recommendationInputFromPayload(payload: unknown, key: "startTime" | "returnHomeTime") {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const recommendation = payload as Recommendation & {
    activity?: {
      [field in typeof key]?: string;
    };
  };

  return recommendation.activity?.[key];
}
