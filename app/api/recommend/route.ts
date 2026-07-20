import { NextResponse } from "next/server";
import {
  applyLearnedRanking,
  createRecommendationResult,
  validateRankerArtifact,
} from "@shorts-ai/core";
import type {
  Json,
  LogisticRankerArtifact,
  RankerCoverage,
  RecommendationRequest,
  RecommendationResult,
} from "@shorts-ai/core";
import { recommendationRequestSchema } from "@/lib/recommendation-schema";
import { getRequestUser } from "@/lib/supabase/server";

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request) {
  const startedAt = Date.now();
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Recommendation request must be JSON." }, { status: 415 });
  }
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Recommendation request is too large." }, { status: 413 });
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Recommendation request is too large." }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Recommendation request must contain valid JSON." }, { status: 400 });
  }

  const validation = recommendationRequestSchema.safeParse(parsed);
  if (!validation.success) {
    return NextResponse.json({
      error: "Recommendation request is invalid.",
      issues: validation.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    }, { status: 400 });
  }

  const payload = validation.data as RecommendationRequest;
  const ruleResult = createRecommendationResult(payload.input, payload.constraints);
  let result = ruleResult;
  let modelFallback = false;

  try {
    const artifact = readRankerArtifact();
    const coverage = readRankerCoverage();
    if (artifact && coverage) {
      const ranked = applyLearnedRanking(
        result,
        payload.input,
        artifact,
        coverage,
        process.env.FEATURE_ML_RANKER === "true" && isInModelRollout(payload.clientRequestId),
      );
      if (hasSafetyViolation(ranked)) {
        console.error("[api/recommend] safety_policy_violation_model_fallback");
        modelFallback = true;
        result = ruleResult;
      } else {
        result = ranked;
      }
    }
  } catch {
    console.warn("[api/recommend] model_fallback");
    modelFallback = true;
  }

  try {
    result = await recordExposure(request, payload, result);
  } catch {
    console.warn("[api/recommend] exposure_write_failed");
  }

  if (process.env.NODE_ENV === "production") {
    console.info(JSON.stringify({
      event: "recommendation_completed",
      activityMode: payload.input.activity.mode,
      source: result.source,
      latencyMs: Date.now() - startedAt,
      modelFallback,
      authenticatedExposure: Boolean(result.recommendationId),
      candidateCount: result.variants.length,
    }));
  }
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

function hasSafetyViolation(result: RecommendationResult) {
  return result.variants.some((variant) =>
    variant.requiredItems.some((required) => !variant.outfit.includes(required)),
  );
}

function isInModelRollout(clientRequestId: string) {
  const configured = Number(process.env.FEATURE_ML_RANKER_PERCENT ?? "100");
  const percentage = Math.max(0, Math.min(100, Number.isFinite(configured) ? configured : 0));
  let hash = 0;
  for (const character of clientRequestId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % 100 < percentage;
}

async function recordExposure(
  request: Request,
  payload: RecommendationRequest,
  result: RecommendationResult,
) {
  const auth = await getRequestUser(request);
  if (!auth) return result;

  await auth.client.from("profiles").upsert({
    id: auth.user.id,
    starter_profile: payload.input.personalization.starterProfile,
    rated_recommendations: payload.input.personalization.ratedRecommendations,
    temperature_offset_c: payload.input.personalization.temperatureOffsetC ?? 0,
    comfort_memory: (payload.input.personalization.comfortMemory ?? {}) as Json,
    updated_at: new Date().toISOString(),
  });

  const { data: recommendation, error } = await auth.client
    .from("recommendations")
    .upsert({
      user_id: auth.user.id,
      client_request_id: payload.clientRequestId,
      location_label: payload.input.current.locationLabel,
      activity_mode: payload.input.activity.mode,
      weather_snapshot: payload.input.current as unknown as Json,
      forecast_snapshot: {
        finish: payload.input.forecastAtFinish,
        returnHome: payload.input.forecastAtReturn,
      } as unknown as Json,
      recommendation_payload: {
        ...result,
        activity: payload.input.activity,
        comfortMemory: payload.input.personalization.comfortMemory ?? {},
        contextTemperatureOffsetC: payload.input.personalization.temperatureOffsetC ?? 0,
      } as unknown as Json,
      confidence_score: result.recommendation.confidenceScore,
      explanation: result.recommendation.explanationFacts.join(" "),
      engine_version: result.engineVersion,
      safety_policy_version: result.safetyPolicyVersion,
      model_version: result.modelVersion ?? null,
      source: result.source,
      selected_variant_id: result.selectedVariantId,
    }, { onConflict: "client_request_id" })
    .select("id")
    .single();
  if (error) throw error;

  const candidates = result.variants.map((variant, index) => ({
    recommendation_id: recommendation.id,
    user_id: auth.user.id,
    variant_id: variant.id,
    variant_kind: variant.kind,
    rank: index + 1,
    candidate_payload: variant as unknown as Json,
    model_score: variant.modelScore ?? null,
    selected: variant.id === result.selectedVariantId,
  }));
  const { error: candidateError } = await auth.client
    .from("recommendation_candidates")
    .upsert(candidates, { onConflict: "recommendation_id,variant_id" });
  if (candidateError) throw candidateError;

  return { ...result, recommendationId: recommendation.id };
}

function readRankerArtifact(): LogisticRankerArtifact | null {
  const raw = process.env.RECOMMENDER_MODEL_JSON;
  if (!raw) return null;
  const parsed: unknown = JSON.parse(raw);
  return validateRankerArtifact(parsed) ? parsed : null;
}

function readRankerCoverage(): RankerCoverage | null {
  const raw = process.env.RECOMMENDER_COVERAGE_JSON;
  if (!raw) return null;
  const value = JSON.parse(raw) as Partial<RankerCoverage>;
  const keys: Array<keyof RankerCoverage> = [
    "validOutcomes", "running", "walking", "commute",
    "commuteWalking", "commuteTransit", "commuteBicycle", "commuteCar",
  ];
  if (!keys.every((key) => Number.isFinite(value[key]))) return null;
  return value as RankerCoverage;
}
