import type { User } from "@supabase/supabase-js";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type {
  FeedbackRating,
  Recommendation,
  RecommendationInput,
  StarterProfile,
} from "@/types/domain";

export type ProfileMemory = {
  starterProfile: StarterProfile;
  personalizationScore: number;
  temperatureOffsetC: number;
  ratedRecommendations: number;
  comfortSummary: string | null;
};

export async function loadProfileMemory(user: User): Promise<ProfileMemory | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "starter_profile, personalization_score, temperature_offset_c, rated_recommendations, comfort_summary",
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
    starterProfile: data.starter_profile as StarterProfile,
    personalizationScore: data.personalization_score,
    temperatureOffsetC: Number(data.temperature_offset_c),
    ratedRecommendations: data.rated_recommendations,
    comfortSummary: data.comfort_summary,
  };
}

export async function ensureProfile(user: User, input: RecommendationInput) {
  if (!isSupabaseConfigured()) {
    return;
  }

  const supabase = createBrowserSupabaseClient();

  await supabase.from("profiles").upsert({
    id: user.id,
    starter_profile: input.personalization.starterProfile,
    personalization_score: Math.min(
      100,
      Math.round((input.personalization.ratedRecommendations / 15) * 100),
    ),
    temperature_offset_c: input.personalization.temperatureOffsetC ?? 0,
    rated_recommendations: input.personalization.ratedRecommendations,
    updated_at: new Date().toISOString(),
  });
}

export async function saveProfileMemory(
  user: User,
  memory: Omit<ProfileMemory, "personalizationScore" | "comfortSummary">,
) {
  if (!isSupabaseConfigured()) {
    return;
  }

  const supabase = createBrowserSupabaseClient();
  const ratedRecommendations = memory.ratedRecommendations;
  const comfortSummary =
    ratedRecommendations >= 15
      ? "Your recommendations are now primarily adjusted by feedback history."
      : null;

  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    starter_profile: memory.starterProfile,
    personalization_score: Math.min(100, Math.round((ratedRecommendations / 15) * 100)),
    temperature_offset_c: memory.temperatureOffsetC,
    rated_recommendations: ratedRecommendations,
    comfort_summary: comfortSummary,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw error;
  }
}

export async function saveRecommendation(
  user: User | null,
  input: RecommendationInput | null,
  recommendation: Recommendation | null,
) {
  if (!user || !input || !recommendation || !isSupabaseConfigured()) {
    return null;
  }

  const supabase = createBrowserSupabaseClient();
  await ensureProfile(user, input);

  const { data, error } = await supabase
    .from("recommendations")
    .insert({
      user_id: user.id,
      location_label: input.current.locationLabel,
      activity_mode: recommendation.activityMode,
      weather_snapshot: input.current,
      forecast_snapshot: {
        finish: input.forecastAtFinish,
        returnHome: input.forecastAtReturn,
      },
      recommendation_payload: recommendation,
      confidence_score: recommendation.confidenceScore,
      explanation: recommendation.explanationFacts.join(" "),
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data.id;
}

export async function saveFeedback(
  user: User | null,
  recommendationId: string | null,
  rating: FeedbackRating,
) {
  if (!user || !recommendationId || !isSupabaseConfigured()) {
    return;
  }

  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase.from("feedback").insert({
    user_id: user.id,
    recommendation_id: recommendationId,
    rating,
  });

  if (error) {
    throw error;
  }
}
