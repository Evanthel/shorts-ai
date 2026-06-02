# Verification Checklist

## Core Scenarios

- Search `Warsaw` and select a result.
- Search `Bergen` and confirm rain warnings appear when rain probability is high.
- Search `Barcelona` and confirm hydration or heat-related guidance can appear.
- Change intensity from `easy` to `hard` and confirm the outfit can become lighter.
- Move return-home time later and confirm return forecast affects the recommendation.

## Personalization

- Click `Good` and confirm rated recommendations increase.
- Click `Too cold` and confirm comfort offset moves colder.
- Click `Too warm` and confirm comfort offset moves warmer.
- Sign in with magic link and confirm profile memory loads after auth.

## AI Explanation

- Click `Generate explanation`.
- Confirm the explanation matches the outfit already shown.
- Confirm the explanation does not add clothing items that are absent from the
  recommendation card.
- Confirm the fallback text appears if `OPENROUTER_API_KEY` is missing.

## Technical Checks

```bash
npm run lint
npm run build
```

Browser smoke test:

- Open `http://localhost:3000`.
- Confirm there are no console errors.
- Confirm the planner works on mobile width and desktop width.
