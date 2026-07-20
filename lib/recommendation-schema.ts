import { clothingItems } from "@shorts-ai/core";
import { z } from "zod";

const dateTimeSchema = z.string().trim().min(1).max(80).refine(
  (value) => Number.isFinite(new Date(value).getTime()),
  "A valid date-time is required.",
);

const weatherSnapshotSchema = z.object({
  temperatureC: z.number().finite().min(-80).max(70),
  feelsLikeC: z.number().finite().min(-100).max(80),
  windKph: z.number().finite().min(0).max(500),
  humidityPercent: z.number().finite().min(0).max(100),
  rainProbabilityPercent: z.number().finite().min(0).max(100),
  uvIndex: z.number().finite().min(0).max(30),
  time: dateTimeSchema,
  locationLabel: z.string().trim().min(1).max(160),
}).strict();

const commuteSchema = z.object({
  mode: z.enum(["walking", "transit", "bicycle", "car"]),
  outdoorMinutes: z.number().int().min(0).max(24 * 60),
  canCarryLayer: z.boolean(),
}).strict();

const activitySchema = z.object({
  mode: z.enum(["running", "walking", "commute"]),
  startTime: dateTimeSchema,
  durationMinutes: z.number().int().min(1).max(24 * 60),
  returnHomeTime: dateTimeSchema,
  intensity: z.enum(["easy", "medium", "hard"]).optional(),
  commute: commuteSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.mode === "running" && !value.intensity) {
    context.addIssue({ code: "custom", message: "Running intensity is required.", path: ["intensity"] });
  }
  if (value.mode === "commute" && !value.commute) {
    context.addIssue({ code: "custom", message: "Commute details are required.", path: ["commute"] });
  }
  if (value.mode !== "commute" && value.commute) {
    context.addIssue({ code: "custom", message: "Commute details are only valid for commute activity.", path: ["commute"] });
  }
});

const comfortStatsSchema = z.object({
  offsetC: z.number().finite().min(-4).max(4),
  outcomes: z.number().int().nonnegative(),
  good: z.number().int().nonnegative(),
  tooCold: z.number().int().nonnegative(),
  tooWarm: z.number().int().nonnegative(),
}).strict();

const comfortMemorySchema = z.record(z.string(), comfortStatsSchema).superRefine((value, context) => {
  const keyPattern = /^(walking|running:(easy|medium|hard)|commute:(walking|transit|bicycle|car))$/;
  for (const key of Object.keys(value)) {
    if (!keyPattern.test(key)) context.addIssue({ code: "custom", message: `Unsupported comfort context: ${key}` });
  }
});

export const recommendationRequestSchema = z.object({
  clientRequestId: z.string().uuid(),
  input: z.object({
    current: weatherSnapshotSchema,
    activity: activitySchema,
    forecastAtFinish: weatherSnapshotSchema,
    forecastAtReturn: weatherSnapshotSchema,
    personalization: z.object({
      starterProfile: z.enum(["standard", "always-cold", "heat-sensitive"]),
      ratedRecommendations: z.number().int().nonnegative().max(1_000_000),
      temperatureOffsetC: z.number().finite().min(-4).max(4).optional(),
      comfortMemory: comfortMemorySchema.optional(),
    }).strict(),
  }).strict(),
  constraints: z.object({
    thermalBias: z.enum(["lighter", "warmer"]).optional(),
    avoidedItems: z.array(z.enum(clothingItems)).max(clothingItems.length).optional(),
    canCarryLayer: z.boolean().optional(),
  }).strict().optional(),
}).strict();
