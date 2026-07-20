import type {
  ActivityInput,
  ComfortContextKey,
  ComfortContextStats,
  ComfortMemory,
  FeedbackRating,
} from "./domain";

export type FeedbackStats = {
  total: number;
  good: number;
  tooCold: number;
  tooWarm: number;
  goodRate: number;
  dominantSignal: "good" | "too_cold" | "too_warm" | "mixed" | "none";
};

export function emptyFeedbackStats(): FeedbackStats {
  return {
    total: 0,
    good: 0,
    tooCold: 0,
    tooWarm: 0,
    goodRate: 0,
    dominantSignal: "none",
  };
}

export function createFeedbackStats(ratings: FeedbackRating[]): FeedbackStats {
  const total = ratings.length;
  const good = ratings.filter((rating) => rating === "good").length;
  const tooCold = ratings.filter((rating) => rating === "too_cold").length;
  const tooWarm = ratings.filter((rating) => rating === "too_warm").length;
  const goodRate = total > 0 ? Math.round((good / total) * 100) : 0;
  const dominantSignal = getDominantFeedbackSignal(good, tooCold, tooWarm);

  return {
    total,
    good,
    tooCold,
    tooWarm,
    goodRate,
    dominantSignal,
  };
}

export function projectFeedbackStats(
  current: FeedbackStats,
  feedback: FeedbackRating,
): FeedbackStats {
  const next = {
    good: current.good + (feedback === "good" ? 1 : 0),
    tooCold: current.tooCold + (feedback === "too_cold" ? 1 : 0),
    tooWarm: current.tooWarm + (feedback === "too_warm" ? 1 : 0),
  };
  const total = current.total + 1;

  return {
    ...next,
    total,
    goodRate: Math.round((next.good / total) * 100),
    dominantSignal: getDominantFeedbackSignal(next.good, next.tooCold, next.tooWarm),
  };
}

export function getFeedbackTemperatureDelta(feedback: FeedbackRating) {
  if (feedback === "too_cold") {
    return -0.5;
  }

  if (feedback === "too_warm") {
    return 0.5;
  }

  return 0;
}

export function getComfortContextKey(activity: ActivityInput): ComfortContextKey {
  if (activity.mode === "running") {
    return `running:${activity.intensity ?? "medium"}`;
  }

  if (activity.mode === "commute") {
    return `commute:${activity.commute?.mode ?? "walking"}`;
  }

  return "walking";
}

export function getContextTemperatureOffset(
  activity: ActivityInput,
  comfortMemory: ComfortMemory | undefined,
  legacyOffsetC = 0,
) {
  return comfortMemory?.[getComfortContextKey(activity)]?.offsetC ?? clampComfortOffset(legacyOffsetC);
}

export function updateComfortMemory(
  comfortMemory: ComfortMemory | undefined,
  activity: ActivityInput,
  feedback: FeedbackRating,
): ComfortMemory {
  const key = getComfortContextKey(activity);
  const current: ComfortContextStats = comfortMemory?.[key] ?? {
    offsetC: 0,
    outcomes: 0,
    good: 0,
    tooCold: 0,
    tooWarm: 0,
  };
  const nextOffset = clampComfortOffset(current.offsetC + getFeedbackTemperatureDelta(feedback));

  return {
    ...(comfortMemory ?? {}),
    [key]: {
      offsetC: nextOffset,
      outcomes: current.outcomes + 1,
      good: current.good + (feedback === "good" ? 1 : 0),
      tooCold: current.tooCold + (feedback === "too_cold" ? 1 : 0),
      tooWarm: current.tooWarm + (feedback === "too_warm" ? 1 : 0),
    },
  };
}

export function clampComfortOffset(value: number) {
  return Math.max(-4, Math.min(4, Math.round(value * 2) / 2));
}

export function normalizeComfortMemory(value: unknown): ComfortMemory {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const memory: ComfortMemory = {};
  for (const [key, stats] of Object.entries(value)) {
    if (!isComfortContextKey(key) || !stats || typeof stats !== "object" || Array.isArray(stats)) continue;
    const candidate = stats as Record<string, unknown>;
    if (![candidate.offsetC, candidate.outcomes, candidate.good, candidate.tooCold, candidate.tooWarm]
      .every((item) => typeof item === "number" && Number.isFinite(item))) continue;
    memory[key] = {
      offsetC: clampComfortOffset(candidate.offsetC as number),
      outcomes: Math.max(0, Math.floor(candidate.outcomes as number)),
      good: Math.max(0, Math.floor(candidate.good as number)),
      tooCold: Math.max(0, Math.floor(candidate.tooCold as number)),
      tooWarm: Math.max(0, Math.floor(candidate.tooWarm as number)),
    };
  }
  return memory;
}

function isComfortContextKey(value: string): value is ComfortContextKey {
  return value === "walking" ||
    /^running:(easy|medium|hard)$/.test(value) ||
    /^commute:(walking|transit|bicycle|car)$/.test(value);
}

export function getFeedbackChangeNote(feedback: FeedbackRating, nextTemperatureOffsetC: number) {
  const offset = `${nextTemperatureOffsetC > 0 ? "+" : ""}${nextTemperatureOffsetC} C`;

  if (feedback === "too_cold") {
    return `Future recommendations will bias warmer. Current comfort offset: ${offset}.`;
  }

  if (feedback === "too_warm") {
    return `Future recommendations will bias lighter. Current comfort offset: ${offset}.`;
  }

  return `Profile marked this recommendation as accurate. Current comfort offset stays at ${offset}.`;
}

export function getProfileLearningCopy(
  ratedRecommendations: number,
  temperatureOffsetC: number,
  profileStatus: string,
  feedbackStats: FeedbackStats,
) {
  const offset =
    temperatureOffsetC === 0
      ? "no comfort offset yet"
      : `${temperatureOffsetC > 0 ? "+" : ""}${temperatureOffsetC} C comfort offset`;
  const quality =
    feedbackStats.total > 0
      ? `${feedbackStats.goodRate}% good across ${feedbackStats.total} ratings`
      : "no quality trend yet";

  if (ratedRecommendations >= 15) {
    return `${buildComfortSummary(feedbackStats, temperatureOffsetC, ratedRecommendations)} ${profileStatus}`;
  }

  return `Learning profile: ${ratedRecommendations}/15 ratings, ${offset}, ${quality}. ${profileStatus}`;
}

export function getRecommendationQualitySummary(
  feedbackStats: FeedbackStats,
  temperatureOffsetC: number,
  ratedRecommendations: number,
) {
  if (feedbackStats.total === 0) {
    return "Quality trend will appear after the first saved rating.";
  }

  if (ratedRecommendations < 5) {
    return "Profile is still learning; a few more ratings will make the trend useful.";
  }

  if (feedbackStats.goodRate >= 70) {
    return "Your profile looks stable; most recommendations are landing well.";
  }

  if (feedbackStats.dominantSignal === "too_cold" || temperatureOffsetC < 0) {
    return "Your profile is biased warmer because cold feedback is showing up.";
  }

  if (feedbackStats.dominantSignal === "too_warm" || temperatureOffsetC > 0) {
    return "Your profile is biased lighter because warm feedback is showing up.";
  }

  return "Feedback is mixed, so the profile is still adjusting cautiously.";
}

export function buildComfortSummary(
  feedbackStats: FeedbackStats,
  temperatureOffsetC: number,
  ratedRecommendations: number,
) {
  const offset =
    temperatureOffsetC === 0
      ? "no comfort offset"
      : `${temperatureOffsetC > 0 ? "+" : ""}${temperatureOffsetC} C comfort offset`;

  if (feedbackStats.dominantSignal === "too_cold") {
    return `Personalized profile active: ${ratedRecommendations} ratings, ${offset}. You often report feeling too cold, so future plans bias warmer.`;
  }

  if (feedbackStats.dominantSignal === "too_warm") {
    return `Personalized profile active: ${ratedRecommendations} ratings, ${offset}. You often report feeling too warm, so future plans bias lighter.`;
  }

  if (feedbackStats.dominantSignal === "good") {
    return `Personalized profile active: ${ratedRecommendations} ratings, ${offset}. Most recent feedback is good, so current thresholds look stable.`;
  }

  return `Personalized profile active: ${ratedRecommendations} ratings, ${offset}. Feedback is mixed, so the profile keeps adjusting cautiously.`;
}

export function getDominantFeedbackSignal(
  good: number,
  tooCold: number,
  tooWarm: number,
): FeedbackStats["dominantSignal"] {
  const max = Math.max(good, tooCold, tooWarm);

  if (max === 0) {
    return "none";
  }

  const leaders = [good, tooCold, tooWarm].filter((value) => value === max);

  if (leaders.length > 1) {
    return "mixed";
  }

  if (max === good) {
    return "good";
  }

  return max === tooCold ? "too_cold" : "too_warm";
}
