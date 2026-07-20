import { createHmac } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type RecordValue = Record<string, unknown>;

const url = configured(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL);
const serviceKey = configured(process.env.SUPABASE_SERVICE_ROLE_KEY);
const pseudonymSecret = configured(process.env.SWAOP_PSEUDONYM_SECRET);

if (!url || !serviceKey || !pseudonymSecret) {
  throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SWAOP_PSEUDONYM_SECRET are required.");
}

const query = new URL(`${url}/rest/v1/recommendation_candidates`);
query.searchParams.set("select", [
  "variant_id", "variant_kind", "rank", "candidate_payload", "model_score", "selected", "created_at", "user_id",
  "recommendations!inner(id,activity_mode,weather_snapshot,forecast_snapshot,recommendation_payload,selected_variant_id,engine_version,model_version,source,created_at,feedback(rating,actually_worn,adjustment,problem_areas))",
].join(","));
query.searchParams.set("order", "created_at.asc");

const records: RecordValue[] = [];
const pageSize = 1_000;
for (let offset = 0; ; offset += pageSize) {
  const response = await fetch(query, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Range: `${offset}-${offset + pageSize - 1}`,
    },
  });
  if (!response.ok) throw new Error(`SWAOP export failed (${response.status}).`);
  const page = await response.json() as RecordValue[];
  records.push(...page);
  if (page.length < pageSize) break;
}
const mappedRows = records.flatMap((candidate) => mapCandidate(candidate, pseudonymSecret));
const orderedTimes = mappedRows.map((row) => new Date(row.observedAt as string).getTime()).filter(Number.isFinite).sort((a, b) => a - b);
const chronologicalCutoff = orderedTimes[Math.max(0, Math.floor(orderedTimes.length * 0.8) - 1)] ?? Date.now();
const rows = mappedRows.flatMap((row) => {
  const observed = new Date(row.observedAt as string).getTime();
  const isTraining = row._userSplit === "training" && observed <= chronologicalCutoff;
  const isEvaluation = row._userSplit === "evaluation" && observed > chronologicalCutoff;
  if (!isTraining && !isEvaluation) return [];
  const { _userSplit, ...exported } = row;
  return [{ ...exported, split: _userSplit }];
});
const outputPath = resolve(process.argv[2] ?? `swaop-${new Date().toISOString().slice(0, 10)}.jsonl`);
await writeFile(outputPath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
console.log(`Exported ${rows.length} authenticated first-party candidate rows to ${outputPath}.`);

function mapCandidate(candidate: RecordValue, secret: string) {
  const recommendation = firstRecord(candidate.recommendations);
  const feedback = firstRecord(recommendation?.feedback);
  if (!recommendation || !feedback || feedback.adjustment === "did_not_follow" || !feedback.actually_worn) return [];
  const payload = asRecord(recommendation.recommendation_payload);
  const activity = asRecord(payload.activity);
  const commute = asRecord(activity.commute);
  const weather = asRecord(recommendation.weather_snapshot);
  const forecasts = asRecord(recommendation.forecast_snapshot);
  const finish = asRecord(forecasts.finish);
  const returnHome = asRecord(forecasts.returnHome);
  const pseudonymousUserId = createHmac("sha256", secret).update(String(candidate.user_id)).digest("hex");

  return [{
    datasetVersion: "swaop-v1",
    pseudonymousUserId,
    _userSplit: Number.parseInt(pseudonymousUserId.slice(0, 8), 16) % 5 === 0 ? "evaluation" : "training",
    observedAt: candidate.created_at,
    weather: stripLocation(weather),
    finishWeather: stripLocation(finish),
    returnWeather: stripLocation(returnHome),
    deltas: {
      finishFeelsLikeC: number(finish.feelsLikeC) - number(weather.feelsLikeC),
      returnFeelsLikeC: number(returnHome.feelsLikeC) - number(weather.feelsLikeC),
      returnRainProbability: number(returnHome.rainProbabilityPercent) - number(weather.rainProbabilityPercent),
      returnWindKph: number(returnHome.windKph) - number(weather.windKph),
    },
    activity: {
      mode: recommendation.activity_mode,
      intensity: activity.intensity ?? null,
      durationMinutes: activity.durationMinutes ?? null,
      commuteMode: commute.mode ?? null,
      outdoorMinutes: commute.outdoorMinutes ?? activity.durationMinutes ?? null,
      canCarryLayer: commute.canCarryLayer ?? null,
    },
    comfortMemory: payload.comfortMemory ?? {},
    contextTemperatureOffsetC: payload.contextTemperatureOffsetC ?? 0,
    candidate: {
      variantId: candidate.variant_id,
      kind: candidate.variant_kind,
      items: asRecord(candidate.candidate_payload).outfit ?? [],
      rank: candidate.rank,
      modelScore: candidate.model_score,
      systemSelected: candidate.variant_id === payload.selectedVariantId,
      userSelected: candidate.variant_id === recommendation.selected_variant_id,
    },
    outcome: {
      actuallyWorn: feedback.actually_worn,
      comfort: feedback.rating,
      adjustment: feedback.adjustment,
      problemAreas: feedback.problem_areas,
    },
    engineVersion: recommendation.engine_version,
    modelVersion: recommendation.model_version,
    recommendationSource: recommendation.source,
  }];
}

function stripLocation(weather: RecordValue) {
  const { locationLabel: _locationLabel, ...safe } = weather;
  return safe;
}

function firstRecord(value: unknown): RecordValue | null {
  if (Array.isArray(value)) return asRecord(value[0]);
  const record = asRecord(value);
  return Object.keys(record).length > 0 ? record : null;
}

function asRecord(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function configured(value: string | undefined) {
  const normalized = value?.trim();
  return normalized && !normalized.startsWith("your-") && !normalized.includes("your-project") ? normalized : undefined;
}
