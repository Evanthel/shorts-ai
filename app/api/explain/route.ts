import { createHmac } from "node:crypto";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  clothingItems,
  createIntentExplanation,
  createOutOfScopeExplanation,
  createRecommendationResult,
  followUpIntents,
  isFollowUpIntent,
} from "@shorts-ai/core";
import type {
  ClassifiedFollowUp,
  ExplanationRequest,
  FollowUpIntent,
  Recommendation,
  RecommendationInput,
  RecommendationResult,
} from "@shorts-ai/core";
import { recommendationRequestSchema } from "@/lib/recommendation-schema";
import { getRequestUser } from "@/lib/supabase/server";

const DEFAULT_MODEL = "google/gemini-2.5-flash-lite";
const LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_BODY_BYTES = 25 * 1024;
const MAX_QUESTION_LENGTH = 300;
const LOCAL_HASH_SECRET = "shorts-ai-local-rate-limit-secret";
const buckets = new Map<string, { count: number; resetAt: number }>();

const classificationSchema = z.object({
  intent: z.enum(followUpIntents),
  avoidedItem: z.enum(clothingItems).nullable(),
}).strict();

export async function POST(request: Request) {
  const parsed = await readPayload(request);
  if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: parsed.status });

  const payload = parsed.payload;
  if (payload.source === "shortcut" && payload.intent) {
    return respondToIntent(request, payload, { intent: payload.intent }, "deterministic");
  }

  const limit = await checkLimit(request);
  if (!limit) {
    return NextResponse.json({
      explanation: createIntentExplanation({ ...payload, intent: "why_outfit" }),
      source: "fallback",
      scope: "in_scope",
      intent: "why_outfit",
      action: "explain",
      error: "Explanation rate limiting is temporarily unavailable.",
    }, { status: 503, headers: { "Retry-After": "60" } });
  }
  if (!limit.allowed) {
    return withLimit(NextResponse.json({
      explanation: createIntentExplanation({ ...payload, intent: "why_outfit" }),
      source: "fallback",
      scope: "in_scope",
      intent: "why_outfit",
      action: "explain",
      limit: { exceeded: true, remaining: 0, resetAt: new Date(limit.resetAt).toISOString() },
    }), 0, limit.resetAt);
  }

  const apiKey = configured(process.env.OPENROUTER_API_KEY);
  if (!apiKey || !payload.question) {
    const response = await respondToIntent(request, payload, { intent: "why_outfit" }, "fallback");
    return withLimit(response, limit.remaining, limit.resetAt);
  }

  try {
    const provider = createOpenRouter({
      apiKey,
      appName: "ShortsAI",
      appUrl: request.headers.get("origin") ?? "https://shorts-ai.app",
      compatibility: "strict",
    });
    const { output } = await generateText({
      model: provider.chat(process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL),
      output: Output.object({ schema: classificationSchema }),
      system: [
        "Classify one English question about an existing weather-and-clothing recommendation.",
        "Return only the schema. Never propose garments or edit the outfit.",
        "Use adjust_warmer or adjust_lighter only for explicit thermal adjustment requests.",
        "Use avoid_item only when a supported clothing item is explicitly requested for avoidance.",
        "Use out_of_scope for fashion, shopping, medical, unrelated, or non-English requests.",
      ].join(" "),
      prompt: payload.question,
      maxOutputTokens: 80,
      temperature: 0,
    });
    const classification = classificationSchema.parse(output) as ClassifiedFollowUp;
    const response = await respondToIntent(request, payload, classification, "openrouter");
    return withLimit(response, limit.remaining, limit.resetAt);
  } catch {
    console.warn("[api/explain] structured_classification_fallback");
    const response = await respondToIntent(request, payload, { intent: "why_outfit" }, "fallback");
    return withLimit(response, limit.remaining, limit.resetAt);
  }
}

async function respondToIntent(
  request: Request,
  payload: ExplanationRequest,
  classification: ClassifiedFollowUp,
  source: "openrouter" | "fallback" | "deterministic",
) {
  const intent = classification.intent;
  const action = actionForIntent(intent);
  let result = payload.recommendationResult;

  if (action === "recalculate") {
    result = createRecommendationResult(payload.input, {
      ...(intent === "adjust_warmer" ? { thermalBias: "warmer" as const } : {}),
      ...(intent === "adjust_lighter" ? { thermalBias: "lighter" as const } : {}),
      ...(intent === "avoid_item" && classification.avoidedItem
        ? { avoidedItems: [classification.avoidedItem] }
        : {}),
    });
  }

  const recommendation = result?.recommendation ?? payload.recommendation;
  const explanation = intent === "out_of_scope"
    ? createOutOfScopeExplanation()
    : createIntentExplanation({ ...payload, recommendation, recommendationResult: result, intent });

  await recordInteraction(request, payload, intent, action, source === "fallback" ? "fallback" : "success");

  return NextResponse.json({
    explanation,
    source,
    scope: intent === "out_of_scope" ? "out_of_scope" : "in_scope",
    intent,
    action,
    ...(result ? { recommendationResult: result } : {}),
  });
}

function actionForIntent(intent: FollowUpIntent): "explain" | "recalculate" | "refuse" {
  if (intent === "out_of_scope") return "refuse";
  if (intent === "adjust_warmer" || intent === "adjust_lighter" || intent === "avoid_item") return "recalculate";
  return "explain";
}

async function recordInteraction(
  request: Request,
  payload: ExplanationRequest,
  intent: FollowUpIntent,
  action: "explain" | "recalculate" | "refuse",
  resultStatus: "success" | "fallback",
) {
  try {
    const auth = await getRequestUser(request);
    if (!auth) return;
    const { error } = await auth.client.from("ai_interactions").insert({
      user_id: auth.user.id,
      recommendation_id: payload.recommendationId ?? null,
      activity_mode: payload.input.activity.mode,
      intent,
      action,
      result_status: resultStatus,
      source: payload.source ?? (payload.question ? "text" : "shortcut"),
    });
    if (error) console.warn("[api/explain] analytics_write_failed");
  } catch {
    console.warn("[api/explain] analytics_write_failed");
  }
}

type PayloadResult =
  | { ok: true; payload: ExplanationRequest }
  | { ok: false; message: string; status: 400 | 413 | 415 };

async function readPayload(request: Request): Promise<PayloadResult> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return { ok: false, message: "Explanation request must be JSON.", status: 415 };
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return { ok: false, message: "Explanation request is too large.", status: 413 };
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    return { ok: false, message: "Explanation request is too large.", status: 413 };
  }

  let value: unknown;
  try { value = JSON.parse(body); } catch {
    return { ok: false, message: "Explanation request must contain valid JSON.", status: 400 };
  }
  if (!isRecord(value)) return { ok: false, message: "Explanation request is invalid.", status: 400 };

  const question = typeof value.question === "string" ? value.question.trim() : undefined;
  if (question && question.length > MAX_QUESTION_LENGTH) {
    return { ok: false, message: `Question must be ${MAX_QUESTION_LENGTH} characters or fewer.`, status: 400 };
  }
  const source = value.source === "shortcut" || value.source === "text" ? value.source : undefined;
  const intent = isFollowUpIntent(value.intent) ? value.intent : undefined;
  if (source === "shortcut" && !intent) {
    return { ok: false, message: "Shortcut requests require a supported intent.", status: 400 };
  }
  if (source !== "shortcut" && !question) {
    return { ok: false, message: "Text requests require a question.", status: 400 };
  }

  const inputValidation = recommendationRequestSchema.shape.input.safeParse(value.input);
  if (!inputValidation.success || !isRecommendation(value.recommendation)) {
    return { ok: false, message: "Explanation request is missing required recommendation data.", status: 400 };
  }

  return {
    ok: true,
    payload: {
      input: inputValidation.data as RecommendationInput,
      recommendation: value.recommendation,
      ...(isRecommendationResult(value.recommendationResult) ? { recommendationResult: value.recommendationResult } : {}),
      ...(typeof value.recommendationId === "string" ? { recommendationId: value.recommendationId } : {}),
      ...(intent ? { intent } : {}),
      ...(source ? { source } : {}),
      ...(question ? { question } : {}),
    },
  };
}

function isRecommendation(value: unknown): value is Recommendation {
  return isRecord(value) &&
    (value.activityMode === "running" || value.activityMode === "walking" || value.activityMode === "commute") &&
    typeof value.headline === "string" && Array.isArray(value.outfit) &&
    typeof value.confidenceScore === "number" && Array.isArray(value.explanationFacts) &&
    Array.isArray(value.riskWarnings) && Array.isArray(value.profileSignals);
}

function isRecommendationResult(value: unknown): value is RecommendationResult {
  return isRecord(value) &&
    (value.source === "rules" || value.source === "model") &&
    typeof value.engineVersion === "string" && typeof value.safetyPolicyVersion === "string" &&
    typeof value.selectedVariantId === "string" && Array.isArray(value.variants) &&
    isRecommendation(value.recommendation);
}

async function checkLimit(request: Request) {
  const secret = configured(process.env.RATE_LIMIT_HASH_SECRET) ??
    (requiresPersistentLimit() ? undefined : LOCAL_HASH_SECRET);
  if (!secret) return null;
  const clientKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() || "anonymous";
  const key = createHmac("sha256", secret).update(clientKey).digest("hex");
  const persistent = await checkPersistentLimit(key);
  if (persistent) return persistent;
  if (requiresPersistentLimit()) return null;

  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + WINDOW_MS;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: LIMIT - 1, resetAt };
  }
  if (bucket.count >= LIMIT) return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  bucket.count += 1;
  return { allowed: true, remaining: LIMIT - bucket.count, resetAt: bucket.resetAt };
}

async function checkPersistentLimit(clientKey: string) {
  const url = configured(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceKey = configured(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !serviceKey) return null;
  try {
    const response = await fetch(`${url}/rest/v1/rpc/consume_ai_rate_limit`, {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_client_key: clientKey, p_limit: LIMIT, p_window_seconds: WINDOW_MS / 1000 }),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const row = Array.isArray(body) ? body[0] : body;
    if (!isRecord(row) || typeof row.allowed !== "boolean" || typeof row.remaining !== "number" || typeof row.reset_at !== "string") return null;
    const resetAt = new Date(row.reset_at).getTime();
    return Number.isFinite(resetAt) ? { allowed: row.allowed, remaining: row.remaining, resetAt } : null;
  } catch { return null; }
}

function withLimit(response: NextResponse, remaining: number, resetAt: number) {
  response.headers.set("X-RateLimit-Limit", String(LIMIT));
  response.headers.set("X-RateLimit-Remaining", String(remaining));
  response.headers.set("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
  return response;
}

function requiresPersistentLimit() {
  return process.env.REQUIRE_PERSISTENT_RATE_LIMIT === "true" || process.env.NODE_ENV === "production";
}

function configured(value: string | undefined) {
  const normalized = value?.trim();
  return !normalized || normalized.startsWith("your-") || normalized.includes("your-project") ? undefined : normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
