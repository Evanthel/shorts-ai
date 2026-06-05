import type { User } from "@supabase/supabase-js";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type {
  ActivityMode,
  FeedbackRating,
  Recommendation,
  RecommendationInput,
  StarterProfile,
} from "@/types/domain";
import type { GeoLocation } from "@/features/weather/open-meteo";

export type ProfileMemory = {
  starterProfile: StarterProfile;
  personalizationScore: number;
  temperatureOffsetC: number;
  ratedRecommendations: number;
  comfortSummary: string | null;
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
};

export type FavouriteLocation = GeoLocation & {
  favouriteId: string;
};

export type FeedbackStats = {
  total: number;
  good: number;
  tooCold: number;
  tooWarm: number;
  goodRate: number;
  dominantSignal: "good" | "too_cold" | "too_warm" | "mixed" | "none";
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
  memory: Omit<ProfileMemory, "personalizationScore" | "comfortSummary"> & {
    comfortSummary?: string | null;
  },
) {
  if (!isSupabaseConfigured()) {
    return;
  }

  const supabase = createBrowserSupabaseClient();
  const ratedRecommendations = memory.ratedRecommendations;
  const comfortSummary = ratedRecommendations >= 15 ? memory.comfortSummary ?? null : null;

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

export async function loadFeedbackStats(user: User | null): Promise<FeedbackStats> {
  if (!user || !isSupabaseConfigured()) {
    return emptyFeedbackStats();
  }

  const supabase = createBrowserSupabaseClient();
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

  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    starter_profile: starterProfile,
    personalization_score: 0,
    temperature_offset_c: 0,
    rated_recommendations: 0,
    comfort_summary: null,
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
      recommendation_payload: {
        ...recommendation,
        activity: input.activity,
      },
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

export async function loadRecommendationHistory(
  user: User | null,
  limit = 5,
): Promise<RecommendationHistoryItem[]> {
  if (!user || !isSupabaseConfigured()) {
    return [];
  }

  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase
    .from("recommendations")
    .select("id, location_label, activity_mode, confidence_score, recommendation_payload, created_at")
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
      activityMode: item.activity_mode as ActivityMode,
      confidenceScore: item.confidence_score,
      headline: recommendation.headline ?? "Saved recommendation",
      createdAtInput: recommendationInputFromPayload(item.recommendation_payload, "startTime"),
      returnHomeTime: recommendationInputFromPayload(item.recommendation_payload, "returnHomeTime"),
      outfitSummary: Array.isArray(recommendation.outfit)
        ? recommendation.outfit.join(", ").replaceAll("_", " ")
        : "Saved outfit",
      createdAt: item.created_at,
    };
  });
}

export async function loadFavouriteLocations(user: User | null): Promise<FavouriteLocation[]> {
  if (!user || !isSupabaseConfigured()) {
    return [];
  }

  const supabase = createBrowserSupabaseClient();
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

  const supabase = createBrowserSupabaseClient();
  const label = [location.name, location.admin1, location.country].filter(Boolean).join(", ");
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

  const supabase = createBrowserSupabaseClient();
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

function emptyFeedbackStats(): FeedbackStats {
  return {
    total: 0,
    good: 0,
    tooCold: 0,
    tooWarm: 0,
    goodRate: 0,
    dominantSignal: "none",
  };
}

function createFeedbackStats(ratings: FeedbackRating[]): FeedbackStats {
  const total = ratings.length;
  const good = ratings.filter((rating) => rating === "good").length;
  const tooCold = ratings.filter((rating) => rating === "too_cold").length;
  const tooWarm = ratings.filter((rating) => rating === "too_warm").length;
  const goodRate = total > 0 ? Math.round((good / total) * 100) : 0;
  const dominantSignal = getDominantSignal(good, tooCold, tooWarm);

  return {
    total,
    good,
    tooCold,
    tooWarm,
    goodRate,
    dominantSignal,
  };
}

function getDominantSignal(
  good: number,
  tooCold: number,
  tooWarm: number,
): FeedbackStats["dominantSignal"] {
  const max = Math.max(good, tooCold, tooWarm);

  if (max === 0) {
    return "none";
  }

  const leaders = [good, tooCold, tooWarm].filter((value) => value === max);

  if (leaders.length > 1) {
    return "mixed";
  }

  if (max === good) {
    return "good";
  }

  return max === tooCold ? "too_cold" : "too_warm";
}
