export type FeatureFlag =
  | "commute_v2"
  | "outfit_variants"
  | "post_activity_feedback"
  | "ai_intents"
  | "ml_ranker";

export type FeatureFlags = Record<FeatureFlag, boolean>;

export const defaultFeatureFlags: FeatureFlags = {
  commute_v2: true,
  outfit_variants: true,
  post_activity_feedback: true,
  ai_intents: true,
  ml_ranker: false,
};

export function resolveFeatureFlags(environment: Record<string, string | undefined>): FeatureFlags {
  return {
    commute_v2: readFlag(environment.FEATURE_COMMUTE_V2, defaultFeatureFlags.commute_v2),
    outfit_variants: readFlag(environment.FEATURE_OUTFIT_VARIANTS, defaultFeatureFlags.outfit_variants),
    post_activity_feedback: readFlag(environment.FEATURE_POST_ACTIVITY_FEEDBACK, defaultFeatureFlags.post_activity_feedback),
    ai_intents: readFlag(environment.FEATURE_AI_INTENTS, defaultFeatureFlags.ai_intents),
    ml_ranker: readFlag(environment.FEATURE_ML_RANKER, defaultFeatureFlags.ml_ranker),
  };
}

function readFlag(value: string | undefined, fallback: boolean) {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}
