import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import {
  createFallbackExplanation,
  createOutOfScopeExplanation,
  isFollowUpInScope,
} from "@/features/recommendation/explanation";
import type { ExplanationRequest } from "@/features/recommendation/explanation";

const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
const defaultModel = "google/gemini-2.5-flash-lite";
const explanationLimit = 10;
const explanationWindowMs = 60 * 60 * 1000;
const explanationWindowSeconds = Math.ceil(explanationWindowMs / 1000);
const maxRequestBodyBytes = 25 * 1024;
const maxQuestionLength = 300;
const localRateLimitHashSecret = "shorts-ai-local-rate-limit-secret";
const explanationBuckets = new Map<string, { count: number; resetAt: number }>();
const supabaseUrl = getConfiguredEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceRoleKey = getConfiguredEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export async function POST(request: Request) {
  const payloadResult = await readExplanationPayload(request);

  if (!payloadResult.ok) {
    logExplainEvent(payloadResult.reason);

    return NextResponse.json(
      {
        error: payloadResult.message,
      },
      {
        status: payloadResult.status,
      },
    );
  }

  const payload = payloadResult.payload;
  const apiKey = process.env.OPENROUTER_API_KEY;
  const appOrigin = request.headers.get("origin") ?? "https://shorts-ai.app";

  if (!isFollowUpInScope(payload.question)) {
    return NextResponse.json({
      explanation: createOutOfScopeExplanation(),
      source: "fallback",
      scope: "out_of_scope",
    });
  }

  const hashSecret = getRateLimitHashSecret();

  if (!hashSecret) {
    logExplainEvent("rate_limit_hash_secret_missing");

    return createRateLimitUnavailableResponse(payload);
  }

  const rateLimit = await checkExplanationLimit(hashClientKey(getClientKey(request), hashSecret));

  if (!rateLimit) {
    logExplainEvent("persistent_rate_limit_required_unavailable");

    return createRateLimitUnavailableResponse(payload);
  }

  if (!rateLimit.allowed) {
    logExplainEvent("rate_limit_exceeded");

    return NextResponse.json(
      {
        explanation: createFallbackExplanation(payload),
        source: "fallback",
        scope: "in_scope",
        limit: {
          exceeded: true,
          resetAt: new Date(rateLimit.resetAt).toISOString(),
        },
      },
      {
        status: 200,
        headers: {
          "X-RateLimit-Limit": String(explanationLimit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
        },
      },
    );
  }

  if (!apiKey) {
    return createExplanationResponse(payload, "fallback", rateLimit.remaining, rateLimit.resetAt);
  }

  try {
    const response = await fetch(openRouterUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": appOrigin,
        "X-Title": "ShortsAI",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL ?? defaultModel,
        max_tokens: 180,
        temperature: 0.35,
        messages: [
          {
            role: "system",
            content:
              "You explain clothing recommendations and answer short follow-up questions only when they are about this plan's weather, activity, outfit, running, walking, commute, or the current recommendation. If the question is outside that scope, refuse briefly and say you can only help with this plan's weather, activity, outfit, and recommendation. Explicitly mention whether the plan is a run, walk, or standard commute/everyday plan when useful, and mention the starter profile context. Do not change, add, or remove clothing items. Use only the structured recommendation, weather facts, and the user's follow-up question. Keep the answer under 80 words.",
          },
          {
            role: "user",
            content: JSON.stringify({
              question: payload.question,
              activity: payload.input.activity,
              personalization: payload.input.personalization,
              weather: {
                start: payload.input.current,
                finish: payload.input.forecastAtFinish,
                returnHome: payload.input.forecastAtReturn,
              },
              recommendation: payload.recommendation,
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error("OpenRouter request failed.");
    }

    const data = (await response.json()) as OpenRouterResponse;
    const explanation = data.choices?.[0]?.message?.content?.trim();

    if (!explanation) {
      throw new Error("OpenRouter returned an empty explanation.");
    }

    return createExplanationResponse(
      { ...payload, explanation },
      "openrouter",
      rateLimit.remaining,
      rateLimit.resetAt,
    );
  } catch {
    logExplainEvent("openrouter_fallback");

    return createExplanationResponse(payload, "fallback", rateLimit.remaining, rateLimit.resetAt);
  }
}

type PayloadParseResult =
  | {
      ok: true;
      payload: ExplanationRequest;
    }
  | {
      ok: false;
      message: string;
      reason: string;
      status: 400 | 413 | 415;
    };

async function readExplanationPayload(request: Request): Promise<PayloadParseResult> {
  const contentLength = Number(request.headers.get("content-length"));

  if (Number.isFinite(contentLength) && contentLength > maxRequestBodyBytes) {
    return {
      ok: false,
      message: "Explanation request is too large.",
      reason: "request_too_large",
      status: 413,
    };
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType && !contentType.toLowerCase().includes("application/json")) {
    return {
      ok: false,
      message: "Explanation request must be JSON.",
      reason: "unsupported_content_type",
      status: 415,
    };
  }

  const body = await request.text();

  if (new TextEncoder().encode(body).length > maxRequestBodyBytes) {
    return {
      ok: false,
      message: "Explanation request is too large.",
      reason: "request_too_large",
      status: 413,
    };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(body);
  } catch {
    return {
      ok: false,
      message: "Explanation request must contain valid JSON.",
      reason: "invalid_json",
      status: 400,
    };
  }

  if (isRecord(parsed) && typeof parsed.question === "string" && parsed.question.trim().length > maxQuestionLength) {
    return {
      ok: false,
      message: `Question must be ${maxQuestionLength} characters or fewer.`,
      reason: "question_too_long",
      status: 400,
    };
  }

  const payload = normalizeExplanationPayload(parsed);

  if (!payload) {
    return {
      ok: false,
      message: "Explanation request is missing required recommendation data.",
      reason: "invalid_payload",
      status: 400,
    };
  }

  return {
    ok: true,
    payload,
  };
}

function normalizeExplanationPayload(value: unknown): ExplanationRequest | null {
  if (!isRecord(value)) {
    return null;
  }

  const input = value.input;
  const recommendation = value.recommendation;
  const question = normalizeQuestion(value.question);

  if (question === null || !isRecommendationInput(input) || !isRecommendation(recommendation)) {
    return null;
  }

  return {
    input,
    recommendation,
    ...(question ? { question } : {}),
  };
}

function normalizeQuestion(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    return null;
  }

  const question = value.trim();

  if (question.length === 0) {
    return undefined;
  }

  if (question.length > maxQuestionLength) {
    return null;
  }

  return question;
}

function isRecommendationInput(value: unknown): value is ExplanationRequest["input"] {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isWeatherSnapshot(value.current) &&
    isWeatherSnapshot(value.forecastAtFinish) &&
    isWeatherSnapshot(value.forecastAtReturn) &&
    isActivityInput(value.activity) &&
    isPersonalizationInput(value.personalization)
  );
}

function isWeatherSnapshot(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isFiniteNumber(value.temperatureC) &&
    isFiniteNumber(value.feelsLikeC) &&
    isFiniteNumber(value.windKph) &&
    isFiniteNumber(value.humidityPercent) &&
    isFiniteNumber(value.rainProbabilityPercent) &&
    isFiniteNumber(value.uvIndex) &&
    isNonEmptyString(value.time) &&
    isNonEmptyString(value.locationLabel)
  );
}

function isActivityInput(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.mode === "running" || value.mode === "walking" || value.mode === "everyday") &&
    isNonEmptyString(value.startTime) &&
    isNonEmptyString(value.returnHomeTime) &&
    isFiniteNumber(value.durationMinutes) &&
    (value.intensity === undefined ||
      value.intensity === "easy" ||
      value.intensity === "medium" ||
      value.intensity === "hard")
  );
}

function isPersonalizationInput(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.starterProfile === "standard" ||
      value.starterProfile === "always-cold" ||
      value.starterProfile === "heat-sensitive") &&
    isFiniteNumber(value.ratedRecommendations) &&
    (value.temperatureOffsetC === undefined || isFiniteNumber(value.temperatureOffsetC))
  );
}

function isRecommendation(value: unknown): value is ExplanationRequest["recommendation"] {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.activityMode === "running" ||
      value.activityMode === "walking" ||
      value.activityMode === "everyday") &&
    isNonEmptyString(value.headline) &&
    Array.isArray(value.outfit) &&
    isFiniteNumber(value.confidenceScore) &&
    Array.isArray(value.explanationFacts) &&
    Array.isArray(value.riskWarnings)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function createExplanationResponse(
  payload: ExplanationRequest & { explanation?: string },
  source: "openrouter" | "fallback",
  remaining: number,
  resetAt: number,
) {
  return NextResponse.json(
    {
      explanation: payload.explanation ?? createFallbackExplanation(payload),
      source,
      scope: "in_scope",
      limit: {
        remaining,
        resetAt: new Date(resetAt).toISOString(),
      },
    },
    {
      headers: {
        "X-RateLimit-Limit": String(explanationLimit),
        "X-RateLimit-Remaining": String(remaining),
        "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
      },
    },
  );
}

async function checkExplanationLimit(key: string) {
  const persistentLimit = await checkPersistentExplanationLimit(key);

  if (persistentLimit) {
    return persistentLimit;
  }

  if (requiresPersistentRateLimit()) {
    return null;
  }

  const now = Date.now();
  const currentBucket = explanationBuckets.get(key);

  if (!currentBucket || currentBucket.resetAt <= now) {
    const resetAt = now + explanationWindowMs;
    explanationBuckets.set(key, { count: 1, resetAt });

    return {
      allowed: true,
      remaining: explanationLimit - 1,
      resetAt,
    };
  }

  if (currentBucket.count >= explanationLimit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: currentBucket.resetAt,
    };
  }

  currentBucket.count += 1;

  return {
    allowed: true,
    remaining: explanationLimit - currentBucket.count,
    resetAt: currentBucket.resetAt,
  };
}

function getClientKey(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const vercelIp = request.headers.get("x-real-ip")?.trim();

  return forwardedFor || vercelIp || "anonymous";
}

async function checkPersistentExplanationLimit(clientKey: string) {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }

  const headers = {
    apikey: supabaseServiceRoleKey,
    Authorization: `Bearer ${supabaseServiceRoleKey}`,
    "Content-Type": "application/json",
  };
  const rpcUrl = `${supabaseUrl}/rest/v1/rpc/consume_ai_rate_limit`;

  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_client_key: clientKey,
        p_limit: explanationLimit,
        p_window_seconds: explanationWindowSeconds,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      logExplainEvent("persistent_rate_limit_rpc_failed");
      return null;
    }

    const rateLimit = parsePersistentRateLimit(await response.json());

    if (!rateLimit) {
      logExplainEvent("persistent_rate_limit_rpc_invalid_response");
      return null;
    }

    return rateLimit;
  } catch {
    logExplainEvent("persistent_rate_limit_unavailable");
    return null;
  }
}

function parsePersistentRateLimit(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;

  if (!isRecord(row)) {
    return null;
  }

  const resetAt = typeof row.reset_at === "string" ? new Date(row.reset_at).getTime() : NaN;

  if (typeof row.allowed !== "boolean" || !isFiniteNumber(row.remaining) || !Number.isFinite(resetAt)) {
    return null;
  }

  return {
    allowed: row.allowed,
    remaining: Math.max(0, Math.floor(row.remaining)),
    resetAt,
  };
}

function createRateLimitUnavailableResponse(payload: ExplanationRequest) {
  return NextResponse.json(
    {
      explanation: createFallbackExplanation(payload),
      source: "fallback",
      scope: "in_scope",
      error: "Explanation rate limiting is temporarily unavailable.",
    },
    {
      status: 503,
      headers: {
        "Retry-After": "60",
      },
    },
  );
}

function getRateLimitHashSecret() {
  const configuredSecret = getConfiguredEnvValue(process.env.RATE_LIMIT_HASH_SECRET);

  if (configuredSecret) {
    return configuredSecret;
  }

  if (requiresPersistentRateLimit()) {
    return null;
  }

  return supabaseServiceRoleKey ?? localRateLimitHashSecret;
}

function requiresPersistentRateLimit() {
  return process.env.REQUIRE_PERSISTENT_RATE_LIMIT === "true" || process.env.NODE_ENV === "production";
}

function hashClientKey(key: string, secret: string) {
  return createHmac("sha256", secret).update(key).digest("hex");
}

function getConfiguredEnvValue(value: string | undefined) {
  const normalized = value?.trim();

  if (!normalized || normalized.startsWith("your-") || normalized.includes("your-project")) {
    return undefined;
  }

  return normalized;
}

function logExplainEvent(event: string) {
  console.warn(`[api/explain] ${event}`);
}
