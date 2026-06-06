# ShortsAI

ShortsAI is a weather-aware outfit planner for runners and everyday outdoor plans. It turns live forecast data, activity timing, return-home conditions, and comfort feedback into a clear clothing recommendation.

The outfit is selected by a deterministic recommendation engine. The AI layer only explains the already selected recommendation in plain language and is scoped to the current plan.

## Public App

ShortsAI is intended to be used through the deployed web app. The public repository is shared for transparency and product review, not for redistribution or reuse as a separate product.

## What It Does

- Searches locations and reads hourly weather from Open-Meteo.
- Plans for running, walking, and everyday or commute use cases.
- Compares start, finish, and return-home forecast conditions.
- Adjusts recommendations with saved comfort feedback and profile scoring.
- Warns about rain, wind, colder returns, heat, and low visibility.
- Uses magic-link sign-in for profile persistence.
- Generates short AI explanations with a deterministic fallback if AI is
  unavailable.
- Supports bounded follow-up questions about the current plan, outfit, weather,
  and activity.
- Shows recommendation quality signals such as good rate, cold feedback, and
  warm feedback.
- Includes Vercel Speed Insights for deployed performance monitoring.

## How It Works

ShortsAI separates outfit decisions from language generation:

- Weather, activity, and profile inputs go into the recommendation engine.
- The engine returns clothing items, risk warnings, confidence, plan context,
  and profile scoring signals.
- The AI explanation layer receives the structured result and explains it
  without changing the outfit.
- Off-topic AI follow-ups are rejected before the model is called.

## Current Scope

ShortsAI is a polished MVP for product review and classroom presentation. It
does not include a trained machine-learning model yet; feedback is stored and
used through deterministic personalization rules so the app can later support a
real model.

The current version intentionally excludes multi-location comparison and travel
mode.

## Tech Stack

- Next.js
- React
- TypeScript
- Supabase
- Open-Meteo
- OpenRouter
- Vercel

## License

This project is proprietary. See [LICENSE](./LICENSE).
