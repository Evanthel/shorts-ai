import { NextResponse } from "next/server";
import { createFallbackExplanation } from "@/features/recommendation/explanation";
import type { ExplanationRequest } from "@/features/recommendation/explanation";

const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
const defaultModel = "openai/gpt-4o-mini";

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

  if (!apiKey) {
    return NextResponse.json({
      explanation: createFallbackExplanation(payload),
      source: "fallback",
    });
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
              "You explain clothing recommendations. Explicitly mention whether the plan is a run, walk, or standard commute/everyday plan, and mention the starter profile context. Do not change, add, or remove clothing items. Use only the structured recommendation and weather facts. Keep the answer under 80 words.",
          },
          {
            role: "user",
            content: JSON.stringify({
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

    return NextResponse.json({
      explanation,
      source: "openrouter",
    });
  } catch {
    return NextResponse.json({
      explanation: createFallbackExplanation(payload),
      source: "fallback",
    });
  }
}
