import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  createFallbackExplanation,
  createOutOfScopeExplanation,
  isFollowUpInScope,
} from "@/features/recommendation/explanation";
import type { ExplanationRequest } from "@/features/recommendation/explanation";

const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
const defaultModel = "openai/gpt-4o-mini";
const explanationLimit = 10;
const explanationWindowMs = 60 * 60 * 1000;
const explanationBuckets = new Map<string, { count: number; resetAt: number }>();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as ExplanationRequest;
  const apiKey = process.env.OPENROUTER_API_KEY;
  const appOrigin = request.headers.get("origin") ?? "https://shorts-ai.app";

  if (!isFollowUpInScope(payload.question)) {
    return NextResponse.json({
      explanation: createOutOfScopeExplanation(),
      source: "fallback",
      scope: "out_of_scope",
    });
  }

  const rateLimit = await checkExplanationLimit(getClientKey(request));

  if (!rateLimit.allowed) {
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
    return createExplanationResponse(payload, "fallback", rateLimit.remaining, rateLimit.resetAt);
  }
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
  const persistentLimit = await checkPersistentExplanationLimit(hashClientKey(key));

  if (persistentLimit) {
    return persistentLimit;
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

  const now = Date.now();
  const resetAt = now + explanationWindowMs;
  const headers = {
    apikey: supabaseServiceRoleKey,
    Authorization: `Bearer ${supabaseServiceRoleKey}`,
    "Content-Type": "application/json",
  };
  const tableUrl = `${supabaseUrl}/rest/v1/ai_rate_limits`;
  const selectUrl = `${tableUrl}?client_key=eq.${encodeURIComponent(clientKey)}&select=client_key,count,reset_at`;

  try {
    const selectResponse = await fetch(selectUrl, {
      headers,
      cache: "no-store",
    });

    if (!selectResponse.ok) {
      return null;
    }

    const rows = (await selectResponse.json()) as Array<{
      client_key: string;
      count: number;
      reset_at: string;
    }>;
    const current = rows[0];

    if (!current || new Date(current.reset_at).getTime() <= now) {
      const response = await fetch(tableUrl, {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          client_key: clientKey,
          count: 1,
          reset_at: new Date(resetAt).toISOString(),
          updated_at: new Date(now).toISOString(),
        }),
      });

      if (!response.ok) {
        return null;
      }

      return {
        allowed: true,
        remaining: explanationLimit - 1,
        resetAt,
      };
    }

    const currentResetAt = new Date(current.reset_at).getTime();

    if (current.count >= explanationLimit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: currentResetAt,
      };
    }

    const nextCount = current.count + 1;
    const updateResponse = await fetch(`${tableUrl}?client_key=eq.${encodeURIComponent(clientKey)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        count: nextCount,
        updated_at: new Date(now).toISOString(),
      }),
    });

    if (!updateResponse.ok) {
      return null;
    }

    return {
      allowed: true,
      remaining: explanationLimit - nextCount,
      resetAt: currentResetAt,
    };
  } catch {
    return null;
  }
}

function hashClientKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}
