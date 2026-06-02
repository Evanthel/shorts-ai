# ShortsAI

ShortsAI is a weather-aware outfit planner for runners and everyday outdoor plans. It turns live forecast data, activity timing, return-home conditions, and comfort feedback into a clear clothing recommendation.

The outfit is selected by a deterministic recommendation engine. The AI layer only explains the already selected recommendation in plain language.

## Public App

ShortsAI is intended to be used through the deployed web app. The public repository is shared for transparency and product review, not for redistribution or reuse as a separate product.

## What It Does

- Searches locations and reads hourly weather from Open-Meteo.
- Plans for running, walking, and everyday or commute use cases.
- Compares start, finish, and return-home forecast conditions.
- Adjusts recommendations with saved comfort feedback.
- Warns about rain, wind, colder returns, heat, and low visibility.
- Uses magic-link sign-in for profile persistence.
- Generates short AI explanations with a deterministic fallback if AI is
  unavailable.

## How It Works

ShortsAI separates outfit decisions from language generation:

- Weather, activity, and profile inputs go into the recommendation engine.
- The engine returns clothing items, risk warnings, confidence, and plan context.
- The AI explanation layer receives the structured result and explains it
  without changing the outfit.

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
