# ShortsAI Dogfooding Guide

Use this guide to test the recommendation flow on a physical iPhone and to collect comparable observations before the learned ranker is enabled. Testers should use weather bands and broad context only; never include an exact address or raw AI question in a report.

## Device checklist

- Install a fresh build and verify that the location permission prompt appears once.
- Allow location access and confirm that the initial forecast uses the current location.
- Deny location access on a second run and confirm that city search remains available.
- Open each time field and verify that the wheel is centered below its field and preserves the selected value.
- Confirm that only activity and time have defaults; profile, running intensity, and commute details require an explicit choice.
- Complete the last required field and confirm that the app scrolls to the recommendation once.
- Change a completed answer and confirm that the app does not force another scroll.
- Turn off the API or use airplane mode and confirm that an outfit and a useful deterministic explanation still appear.
- Accept an outfit, allow notifications, and verify that the reminder opens the exact pending recommendation.
- Repeat with notifications denied, restart the app, and verify that pending feedback remains available.

## Recommendation scenarios

Run each scenario when the real forecast is reasonably close to the stated band. Exact garment combinations may differ as safety rules evolve; the invariant in the final column is the acceptance target.

| ID | Activity and context | Weather band | Expected behavior | Verify |
| --- | --- | --- | --- | --- |
| D01 | Easy run, 45–60 min | 16–20 C, dry, light wind | Light main-run outfit; any start or return layer is separated | Main outfit is visually first |
| D02 | Hard run, 30–45 min | 25 C or warmer, humid | Light outfit and an overheating warning | Warmer choice cannot suppress the warning |
| D03 | Run with a colder return | Return at least 5 C colder | Return layer and colder-return explanation | `For the return` is actionable |
| D04 | Run in rain | Rain probability at least 70% | Rain protection remains in every safe variant | Lighter choice keeps required protection |
| D05 | Walk, 45–90 min | 12–18 C, dry | Stable walking outfit without running phases | No invented carry layer |
| D06 | Walk in strong wind | Wind at least 30 km/h | Wind risk is explained and protected | Safety message names the risk |
| D07 | Walking commute, 20–40 min outdoors | 5–12 C | Walking-appropriate insulation | Outdoor exposure affects result |
| D08 | Transit commute, 10–20 min outdoors | Near freezing | Cold protection remains across variants | Indoor/outdoor shortcut is useful |
| D09 | Bicycle commute, 20–40 min | 12–18 C, dry | Lighter than an equivalent car commute | Activity heat is reflected safely |
| D10 | Car commute, under 10 min outdoors | 12–18 C, dry | Outfit reflects low exertion and brief exposure | No unnecessary carry instruction |
| D11 | Commute, can carry a layer | Return at least 5 C colder | Extra return layer may be carried | Carry and return sections agree |
| D12 | Commute, cannot carry a layer | Large temperature swing | One safe compromise, no impossible carry plan | Constraint is respected |
| D13 | Any activity, Always cold | Mild conditions | Warmer than Standard profile when variants differ | Only that context memory changes later |
| D14 | Any activity, Heat sensitive | Mild conditions | Lighter than Standard profile when safe | Required items remain present |
| D15 | Any outdoor activity near darkness | Low visibility conditions | Visibility warning or requirement remains | Variant and AI cannot remove it |
| D16 | Any completed plan, API unavailable | Any safe weather | Local rule result and deterministic explanation | No blocking error state |

## Reporting a bad recommendation

Open a GitHub issue with the **Recommendation report** template. Include:

- app version or commit, platform, and device model;
- scenario ID, activity context, duration, and a broad weather band;
- selected variant and whether the recommendation was actually worn;
- actual result, expected result, and whether the concern is safety-related;
- reproducible steps and sanitized screenshots when useful.

Do not include an exact location, email, access token, raw AI question, or another person's personal data. Mark an immediate cold, heat, rain, wind, or visibility risk as a safety issue.

## Metrics required before model influence

Track the following by activity, temperature band, variant, and commute subtype:

- required-field completion and time to first recommendation;
- recommendation acceptance and post-activity feedback completion;
- lighter, standard, and warmer selection rates;
- `good`, `too_cold`, and `too_warm` rates;
- added-layer, removed-layer, changed-top, and changed-bottom rates;
- actually-worn rate and problem area distribution;
- recommendation API latency, local fallback rate, and model fallback rate;
- AI fallback and out-of-scope rates;
- safety-policy violations, which must remain zero;
- authenticated outcome coverage by activity, temperature band, and commute subtype.

The learned ranker must remain in shadow mode until the production activation gates in the README are satisfied. Product judgment should also require stable or improving `good` rate, no safety regression, adequate cold and hot weather coverage, and acceptable feedback completion.
