import type {
  ActivityMode,
  ComfortMemory,
  CommuteMode,
  RecommendationInput,
  RunningIntensity,
  StarterProfile,
} from "./domain";
import type { LocationForecast } from "./weather/open-meteo";
import { findClosestForecast } from "./weather/open-meteo";

export type PlannerForm = {
  mode: ActivityMode;
  starterProfile: StarterProfile;
  startTime: string;
  durationMinutes: number;
  returnHomeTime: string;
  intensity: RunningIntensity;
  commuteMode: CommuteMode;
  outdoorMinutes: number;
  canCarryLayer: boolean;
};

export function createInitialPlannerForm(now = new Date()): PlannerForm {
  const start = roundToNextHour(now);
  const returnHome = addMinutes(start, 90);

  return {
    mode: "running",
    starterProfile: "standard",
    startTime: toDateTimeInputValue(start),
    durationMinutes: 45,
    returnHomeTime: toDateTimeInputValue(returnHome),
    intensity: "medium",
    commuteMode: "transit",
    outdoorMinutes: 20,
    canCarryLayer: true,
  };
}

export function buildRecommendationInput(
  form: PlannerForm,
  forecast: LocationForecast,
  ratedRecommendations: number,
  temperatureOffsetC: number,
  comfortMemory?: ComfortMemory,
): RecommendationInput {
  const finishTime = toDateTimeInputValue(addMinutes(new Date(form.startTime), form.durationMinutes));

  return {
    current: findClosestForecast(forecast.hourly, form.startTime),
    forecastAtFinish: findClosestForecast(forecast.hourly, finishTime),
    forecastAtReturn: findClosestForecast(forecast.hourly, form.returnHomeTime),
    activity: {
      mode: form.mode,
      startTime: form.startTime,
      durationMinutes: form.durationMinutes,
      returnHomeTime: form.returnHomeTime,
      intensity: form.mode === "running" ? form.intensity : undefined,
      commute: form.mode === "commute"
        ? {
            mode: form.commuteMode,
            outdoorMinutes: form.outdoorMinutes,
            canCarryLayer: form.canCarryLayer,
          }
        : undefined,
    },
    personalization: {
      starterProfile: form.starterProfile,
      ratedRecommendations,
      temperatureOffsetC,
      comfortMemory,
    },
  };
}

export function shiftPlannerStartTime(form: PlannerForm, nextStartTime: string): PlannerForm {
  const previousStart = new Date(form.startTime);
  const nextStart = new Date(nextStartTime);
  const returnHome = new Date(form.returnHomeTime);
  const deltaMs = nextStart.getTime() - previousStart.getTime();

  if (!Number.isFinite(deltaMs)) {
    return {
      ...form,
      startTime: nextStartTime,
    };
  }

  return {
    ...form,
    startTime: nextStartTime,
    returnHomeTime: toDateTimeInputValue(new Date(returnHome.getTime() + deltaMs)),
  };
}

export function updatePlannerDuration(form: PlannerForm, nextDuration: number): PlannerForm {
  const durationDelta = nextDuration - form.durationMinutes;
  const returnHome = addMinutes(new Date(form.returnHomeTime), durationDelta);

  return {
    ...form,
    durationMinutes: nextDuration,
    returnHomeTime: toDateTimeInputValue(returnHome),
  };
}

export function updatePlannerStartClockTime(
  form: PlannerForm,
  nextClockTime: string,
  now = new Date(),
): PlannerForm {
  return shiftPlannerStartTime(form, mergeClockTimeIntoDate(form.startTime, nextClockTime, now));
}

export function updatePlannerReturnClockTime(
  form: PlannerForm,
  nextClockTime: string,
  now = new Date(),
): PlannerForm {
  return {
    ...form,
    returnHomeTime: mergeClockTimeIntoDate(form.returnHomeTime, nextClockTime, now),
  };
}

export function formatClockTime(value: string) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${hours}:${minutes}`;
}

export function mergeClockTimeIntoDate(
  currentDateTime: string,
  clockTime: string,
  fallbackDate = new Date(),
) {
  const [hoursText, minutesText = "0"] = clockTime.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return currentDateTime;
  }

  const current = new Date(currentDateTime);
  const base = Number.isFinite(current.getTime()) ? current : fallbackDate;
  const next = new Date(base);
  next.setHours(hours, minutes, 0, 0);

  return toDateTimeInputValue(next);
}

export function roundToNextHour(date: Date) {
  const next = new Date(date);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);

  return next;
}

export function addMinutes(date: Date, minutes: number) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);

  return next;
}

export function toDateTimeInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
