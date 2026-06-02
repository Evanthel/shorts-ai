# ShortsAI Demo Script

## 1. Open With The Problem

Weather apps show raw numbers. ShortsAI turns those numbers into a clothing
decision for a specific run.

## 2. Show The Planner

- Search for a city, for example `Warsaw`, `Bergen`, or `Barcelona`.
- Select the matching location result.
- Set run intensity and return-home time.
- Point out that the recommendation uses hourly forecast, not a daily average.

## 3. Explain The Recommendation

- Warm-up, main run, and post-run can differ.
- Confidence drops when rain, wind, or colder return conditions increase risk.
- Risk warnings explain why extra layers or rain protection may be needed.

## 4. Show Personalization

- Click `Too cold` or `Too warm`.
- The comfort offset changes immediately.
- If signed in, this feedback is saved to Supabase profile memory.

## 5. Show The AI Layer

- Click `Generate explanation`.
- Explain that the LLM does not choose clothing.
- The recommendation engine decides the outfit; the LLM only explains the
  structured result in natural language.

## 6. Close With The Architecture

ShortsAI combines Open-Meteo forecast data, a deterministic recommendation
engine, Supabase profile memory, feedback labels, and an OpenRouter explanation
layer.
