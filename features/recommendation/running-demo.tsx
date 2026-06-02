"use client";

import { useEffect, useState, useTransition } from "react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthPanel } from "@/features/auth/auth-panel";
import { createRecommendation } from "@/features/recommendation/engine";
import { requestExplanation } from "@/features/recommendation/explanation";
import {
  loadProfileMemory,
  saveFeedback,
  saveProfileMemory,
  saveRecommendation,
} from "@/features/recommendation/persistence";
import { starterProfiles } from "@/features/recommendation/profiles";
import {
  fetchLocationForecast,
  findClosestForecast,
  formatLocationLabel,
  searchLocations,
} from "@/features/weather/open-meteo";
import type { GeoLocation, LocationForecast } from "@/features/weather/open-meteo";
import type {
  ActivityMode,
  ClothingItem,
  RecommendationInput,
  RunningIntensity,
  StarterProfile,
} from "@/types/domain";

type PlannerForm = {
  mode: ActivityMode;
  starterProfile: StarterProfile;
  startTime: string;
  durationMinutes: number;
  returnHomeTime: string;
  intensity: RunningIntensity;
};

const clothingLabels: Record<ClothingItem, string> = {
  shorts: "Shorts",
  long_pants: "Long pants",
  t_shirt: "T-shirt",
  long_sleeve: "Long sleeve",
  hoodie: "Hoodie",
  light_jacket: "Light jacket",
  rain_jacket: "Rain jacket",
  gloves: "Gloves",
  hat: "Hat",
};

export function RunningDemo() {
  const [form, setForm] = useState<PlannerForm>(() => createInitialForm());
  const [locationQuery, setLocationQuery] = useState("Warsaw");
  const [locationResults, setLocationResults] = useState<GeoLocation[]>([]);
  const [forecast, setForecast] = useState<LocationForecast | null>(null);
  const [weatherStatus, setWeatherStatus] = useState("Loading Warsaw forecast...");
  const [ratedRecommendations, setRatedRecommendations] = useState(3);
  const [temperatureOffsetC, setTemperatureOffsetC] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [lastRecommendationId, setLastRecommendationId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState("Sign in to save your profile.");
  const [profileStatus, setProfileStatus] = useState("Using starter profile.");
  const [explanation, setExplanation] = useState("");
  const [explanationStatus, setExplanationStatus] = useState(
    "Generate an explanation after the recommendation is ready.",
  );
  const [isPending, startTransition] = useTransition();

  const recommendationInput = forecast
    ? buildRecommendationInput(form, forecast, ratedRecommendations, temperatureOffsetC)
    : null;
  const recommendation = recommendationInput
    ? createRecommendation(recommendationInput)
    : null;
  const running = recommendation?.running;
  const readiness = Math.min(100, Math.round((ratedRecommendations / 15) * 100));
  const isPersonalized = readiness >= 100;
  const shouldShowStarterProfile = !user || !isPersonalized;
  const shouldShowLocationResults = locationQuery.trim().length >= 2 && locationResults.length > 0;
  const isSaveWarning =
    saveStatus.startsWith("Sign in") ||
    saveStatus.startsWith("Could not") ||
    saveStatus.includes("keep it");

  function updateForm<Key extends keyof PlannerForm>(key: Key, value: PlannerForm[Key]) {
    resetExplanation();
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetExplanation() {
    setExplanation("");
    setExplanationStatus("Generate an explanation after the recommendation is ready.");
  }

  function runSearch() {
    if (locationQuery.trim().length < 2) {
      setLocationResults([]);
      setWeatherStatus("Type at least two characters to search.");
      return;
    }

    startTransition(async () => {
      setWeatherStatus("Searching locations...");

      try {
        const results = await searchLocations(locationQuery);
        setLocationResults(results);
        setWeatherStatus(results.length > 0 ? "Choose a matching location." : "No locations found.");
      } catch {
        setWeatherStatus("Location search failed.");
      }
    });
  }

  function chooseLocation(location: GeoLocation) {
    startTransition(async () => {
      resetExplanation();
      await selectLocation(location, false);
      setLocationQuery(formatLocationLabel(location));
      setLocationResults([]);
    });
  }

  async function selectLocation(location: GeoLocation, ignore: boolean) {
    setWeatherStatus(`Loading forecast for ${formatLocationLabel(location)}...`);

    try {
      const nextForecast = await fetchLocationForecast(location);

      if (ignore) {
        return;
      }

      setForecast(nextForecast);
      setWeatherStatus(`Using live forecast for ${formatLocationLabel(location)}.`);
    } catch {
      if (!ignore) {
        setWeatherStatus("Weather forecast failed.");
      }
    }
  }

  useEffect(() => {
    let ignore = false;

    async function loadInitialForecast() {
      try {
        const results = await searchLocations("Warsaw");

        if (ignore) {
          return;
        }

        if (results[0]) {
          await selectLocation(results[0], ignore);
        }
      } catch {
        if (!ignore) {
          setWeatherStatus("Could not load the initial forecast.");
        }
      }
    }

    void loadInitialForecast();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    async function syncProfileMemory() {
      if (!user) {
        setProfileStatus("Using starter profile.");
        setSaveStatus("Sign in to save your profile.");
        return;
      }

      try {
        setProfileStatus("Loading profile...");
        const memory = await loadProfileMemory(user);

        if (ignore) {
          return;
        }

        if (!memory) {
          setProfileStatus("No saved profile yet.");
          return;
        }

        setRatedRecommendations(memory.ratedRecommendations);
        setTemperatureOffsetC(memory.temperatureOffsetC);
        setForm((current) => ({
          ...current,
          starterProfile: memory.starterProfile,
        }));
        setProfileStatus(memory.comfortSummary ?? "Loaded saved profile.");
      } catch {
        if (!ignore) {
          setProfileStatus("Could not load profile.");
        }
      }
    }

    void syncProfileMemory();

    return () => {
      ignore = true;
    };
  }, [user]);

  async function persistCurrentRecommendation() {
    if (!user) {
      setSaveStatus("Sign in to save recommendation history.");
      return null;
    }

    try {
      setSaveStatus("Saving recommendation...");
      const recommendationId = await saveRecommendation(user, recommendationInput, recommendation);
      setLastRecommendationId(recommendationId);
      setSaveStatus("Recommendation saved.");
      return recommendationId;
    } catch {
      setSaveStatus("Could not save recommendation.");
      return null;
    }
  }

  async function applyFeedback(feedback: "good" | "too_cold" | "too_warm") {
    const nextRatedRecommendations = ratedRecommendations + 1;
    const nextTemperatureOffsetC =
      temperatureOffsetC + getFeedbackTemperatureDelta(feedback);

    setRatedRecommendations(nextRatedRecommendations);
    setTemperatureOffsetC(nextTemperatureOffsetC);

    if (!user) {
      setSaveStatus("Feedback adjusted this session. Sign in to keep it.");
      setProfileStatus("Session profile updated.");
      return;
    }

    try {
      const recommendationId =
        lastRecommendationId ?? (await saveRecommendation(user, recommendationInput, recommendation));

      setLastRecommendationId(recommendationId);

      if (recommendationId) {
        await saveFeedback(user, recommendationId, feedback);
      }

      await saveProfileMemory(user, {
        starterProfile: form.starterProfile,
        ratedRecommendations: nextRatedRecommendations,
        temperatureOffsetC: nextTemperatureOffsetC,
      });

      setSaveStatus("Feedback saved to your profile.");
      setProfileStatus("Profile updated.");
    } catch {
      setSaveStatus("Could not save feedback.");
    }
  }

  async function generateExplanation() {
    if (!recommendationInput || !recommendation) {
      setExplanationStatus("Choose a location first.");
      return;
    }

    try {
      setExplanationStatus("Generating explanation...");
      const result = await requestExplanation({
        input: recommendationInput,
        recommendation,
      });

      setExplanation(result.explanation);
      setExplanationStatus(
        result.source === "openrouter"
          ? "Explanation generated by OpenRouter."
          : "Using deterministic fallback explanation.",
      );
    } catch {
      setExplanationStatus("Could not generate explanation.");
    }
  }

  function updateStartTime(nextStartTime: string) {
    const previousStart = new Date(form.startTime);
    const nextStart = new Date(nextStartTime);
    const returnHome = new Date(form.returnHomeTime);
    const deltaMs = nextStart.getTime() - previousStart.getTime();

    if (!Number.isFinite(deltaMs)) {
      updateForm("startTime", nextStartTime);
      return;
    }

    setForm((current) => ({
      ...current,
      startTime: nextStartTime,
      returnHomeTime: toDateTimeInputValue(new Date(returnHome.getTime() + deltaMs)),
    }));
    resetExplanation();
  }

  function updateDuration(nextDuration: number) {
    const durationDelta = nextDuration - form.durationMinutes;
    const returnHome = addMinutes(new Date(form.returnHomeTime), durationDelta);

    setForm((current) => ({
      ...current,
      durationMinutes: nextDuration,
      returnHomeTime: toDateTimeInputValue(returnHome),
    }));
    resetExplanation();
  }

  return (
    <section id="run-planner" className="demo-shell">
      <div className="demo-heading">
        <p className="eyebrow">Planner</p>
        <h2>Plan the outfit against the hourly forecast.</h2>
        <p>
          Search a city, set the activity window, and ShortsAI turns weather
          signals into an outfit for the plan and the way home.
        </p>
      </div>

      <div className="demo-workspace">
        <form className="demo-form" aria-label="Running recommendation controls">
          <div className="field field-wide">
            <label htmlFor="locationSearch">Search location</label>
            <div className="search-row">
              <input
                id="locationSearch"
                type="search"
                value={locationQuery}
                onChange={(event) => {
                  setLocationQuery(event.target.value);

                  if (event.target.value.trim().length === 0) {
                    setLocationResults([]);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    runSearch();
                  }
                }}
              />
              <button type="button" onClick={runSearch} disabled={isPending}>
                Search
              </button>
            </div>
          </div>

          <p className="forecast-status field-wide" aria-live="polite">
            {weatherStatus}
          </p>

          {shouldShowLocationResults ? (
            <div className="location-results field-wide">
              <div>
                {locationResults.map((location) => (
                  <button
                    key={location.id}
                    type="button"
                    onClick={() => chooseLocation(location)}
                  >
                    {formatLocationLabel(location)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="field">
            <label htmlFor="activityMode">Activity</label>
            <select
              id="activityMode"
              value={form.mode}
              onChange={(event) =>
                updateForm("mode", event.target.value as ActivityMode)
              }
            >
              <option value="running">Running</option>
              <option value="walking">Walking</option>
              <option value="everyday">Everyday / commute</option>
            </select>
          </div>

          {shouldShowStarterProfile ? (
            <div className="field">
              <label htmlFor="profile">Starter profile</label>
              <select
                id="profile"
                value={form.starterProfile}
                onChange={(event) =>
                  updateForm("starterProfile", event.target.value as StarterProfile)
                }
              >
                {Object.values(starterProfiles).map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {form.mode === "running" ? (
            <div className="field">
              <label htmlFor="intensity">Intensity</label>
              <select
                id="intensity"
                value={form.intensity}
                onChange={(event) =>
                  updateForm("intensity", event.target.value as RunningIntensity)
                }
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          ) : null}

          <div className="field">
            <label htmlFor="startTime">Start time</label>
            <input
              id="startTime"
              type="datetime-local"
              value={form.startTime}
              onChange={(event) => updateStartTime(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="duration">Duration</label>
            <input
              id="duration"
              min="15"
              max="120"
              step="5"
              type="number"
              value={form.durationMinutes}
              onChange={(event) =>
                updateDuration(Number(event.target.value))
              }
            />
          </div>

          <div className="field">
            <label htmlFor="returnHomeTime">Return home</label>
            <input
              id="returnHomeTime"
              type="datetime-local"
              value={form.returnHomeTime}
              onChange={(event) => updateForm("returnHomeTime", event.target.value)}
            />
          </div>
        </form>

        <article className="recommendation-panel" aria-live="polite">
          {recommendation && recommendationInput ? (
            <>
              <div className="panel-topline">
                <span>{recommendationInput.current.locationLabel}</span>
                <strong>{recommendation.confidenceScore}% confidence</strong>
              </div>
              <h3>{recommendation.headline}</h3>
              <p className="activity-context">
                {getActivityLabel(recommendationInput.activity.mode)} with{" "}
                {starterProfiles[
                  recommendationInput.personalization.starterProfile
                ].label.toLowerCase()} profile.
              </p>
              <div className="weather-strip live-weather">
                <span>
                  Start {recommendationInput.current.temperatureC} C feels like{" "}
                  {recommendationInput.current.feelsLikeC} C
                </span>
                <span>Wind {recommendationInput.current.windKph} km/h</span>
                <span>
                  Return feels like {recommendationInput.forecastAtReturn.feelsLikeC} C
                </span>
              </div>
              {running ? (
                <>
                  <div className="phase-grid">
                    <OutfitPhase title="Warm-up" items={running.warmUp} />
                    <OutfitPhase title="Main run" items={running.mainRun} />
                    <OutfitPhase title="Post-run" items={running.postRun} />
                  </div>

                  <div className="reminder-strip">
                    <StatusPill active={running.carryExtraLayer}>
                      Carry extra layer
                    </StatusPill>
                    <StatusPill active={running.hydrationReminder}>
                      Hydration reminder
                    </StatusPill>
                    <StatusPill active={running.visibilityReminder}>
                      Visibility reminder
                    </StatusPill>
                  </div>
                </>
              ) : (
                <div className="phase-grid single-phase">
                  <OutfitPhase title="Recommended outfit" items={recommendation.outfit} />
                </div>
              )}

              <div className="risk-list">
                <h4>Risk warnings</h4>
                {recommendation.riskWarnings.length > 0 ? (
                  recommendation.riskWarnings.map((warning) => (
                    <p key={warning.type}>
                      <strong>{warning.severity}</strong>
                      {warning.message}
                    </p>
                  ))
                ) : (
                  <p>No major weather risks detected for this plan window.</p>
                )}
              </div>

              <div className="explanation-panel">
                <div>
                  <h4>AI explanation</h4>
                  <button type="button" onClick={generateExplanation}>
                    Generate explanation
                  </button>
                </div>
                <p>{explanation || explanationStatus}</p>
                {explanation ? <small>{explanationStatus}</small> : null}
              </div>
            </>
          ) : (
            <div className="empty-recommendation">
              <p className="eyebrow">Waiting for weather</p>
              <h3>Choose a location to generate a recommendation.</h3>
            </div>
          )}
        </article>

        <div className="side-stack">
          <AuthPanel onUserChange={setUser} />
          <aside className="personalization-panel">
            <p className="eyebrow">Personalization</p>
            {isPersonalized ? (
              <h3>Good job 👟</h3>
            ) : (
              <>
                <h3>{readiness}% ready</h3>
                <div className="progress-track" aria-label="Personalization readiness">
                  <span style={{ width: `${readiness}%` }} />
                </div>
              </>
            )}
            <p>
              Stage:{" "}
              {recommendation?.personalizationStage.replace("_", " ") ?? "starter profile"}.
            </p>
            <div className="feedback-actions">
              <button type="button" onClick={() => applyFeedback("good")}>
                Good
              </button>
              <button type="button" onClick={() => applyFeedback("too_cold")}>
                Too cold
              </button>
              <button type="button" onClick={() => applyFeedback("too_warm")}>
                Too warm
              </button>
            </div>
            <button className="save-button" type="button" onClick={persistCurrentRecommendation}>
              Save recommendation
            </button>
            <p className="profile-note">
              Current comfort offset: {temperatureOffsetC > 0 ? "+" : ""}
              {temperatureOffsetC} C. {profileStatus}
            </p>
            <p className={isSaveWarning ? "save-status warning" : "save-status"}>
              {saveStatus}
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}

function OutfitPhase({ title, items }: { title: string; items: ClothingItem[] }) {
  return (
    <section className="phase">
      <span>{title}</span>
      <p>{items.map((item) => clothingLabels[item]).join(", ")}</p>
    </section>
  );
}

function StatusPill({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <span className={active ? "status-pill active" : "status-pill"}>{children}</span>
  );
}

function createInitialForm(): PlannerForm {
  const start = roundToNextHour(new Date());
  const returnHome = addMinutes(start, 90);

  return {
    mode: "running",
    starterProfile: "runner",
    startTime: toDateTimeInputValue(start),
    durationMinutes: 45,
    returnHomeTime: toDateTimeInputValue(returnHome),
    intensity: "medium",
  };
}

function buildRecommendationInput(
  form: PlannerForm,
  forecast: LocationForecast,
  ratedRecommendations: number,
  temperatureOffsetC: number,
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
    },
    personalization: {
      starterProfile: form.starterProfile,
      ratedRecommendations,
      temperatureOffsetC,
    },
  };
}

function roundToNextHour(date: Date) {
  const next = new Date(date);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);

  return next;
}

function addMinutes(date: Date, minutes: number) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);

  return next;
}

function toDateTimeInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getFeedbackTemperatureDelta(feedback: "good" | "too_cold" | "too_warm") {
  if (feedback === "too_cold") {
    return -1;
  }

  if (feedback === "too_warm") {
    return 1;
  }

  return 0;
}

function getActivityLabel(mode: ActivityMode) {
  if (mode === "running") {
    return "Run plan";
  }

  if (mode === "walking") {
    return "Walking plan";
  }

  return "Everyday / commute plan";
}
