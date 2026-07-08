"use client";

import { useEffect, useState, useTransition } from "react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthPanel } from "@/features/auth/auth-panel";
import {
  createOutOfScopeExplanation,
  isFollowUpInScope,
  requestExplanation,
} from "@/features/recommendation/explanation";
import {
  deleteFavouriteLocation,
  loadFeedbackStats,
  loadFavouriteLocations,
  loadProfileMemory,
  loadRecommendationHistory,
  resetProfileMemory,
  saveFeedback,
  saveFavouriteLocation,
  saveProfileMemory,
  saveRecommendation,
} from "@/features/recommendation/persistence";
import type {
  FeedbackStats,
  FavouriteLocation,
  RecommendationHistoryItem,
} from "@/features/recommendation/persistence";
import {
  buildComfortSummary,
  buildRecommendationInput,
  createInitialPlannerForm,
  createRecommendation,
  emptyFeedbackStats,
  fetchLocationForecast,
  formatLocationLabel,
  getFeedbackChangeNote,
  getFeedbackTemperatureDelta,
  getProfileLearningCopy,
  getRecommendationQualitySummary,
  projectFeedbackStats,
  searchLocations,
  shiftPlannerStartTime,
  starterProfiles,
  updatePlannerDuration,
} from "@shorts-ai/core";
import { publishWeatherPreviewForecast } from "@/features/weather/preview-events";
import type {
  ActivityMode,
  ClothingItem,
  GeoLocation,
  LocationForecast,
  PlannerForm,
  RunningIntensity,
  StarterProfile,
  WeatherSnapshot,
} from "@shorts-ai/core";

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
  const [form, setForm] = useState<PlannerForm>(() => createInitialPlannerForm());
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
  const [favouriteStatus, setFavouriteStatus] = useState("");
  const [favouriteLocations, setFavouriteLocations] = useState<FavouriteLocation[]>([]);
  const [defaultFavouriteId, setDefaultFavouriteId] = useState<string | null>(null);
  const [recommendationHistory, setRecommendationHistory] = useState<RecommendationHistoryItem[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [feedbackStats, setFeedbackStats] = useState<FeedbackStats>(() => emptyFeedbackStats());
  const [explanation, setExplanation] = useState("");
  const [explanationTone, setExplanationTone] = useState<"neutral" | "success" | "warning">("neutral");
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [explanationStatus, setExplanationStatus] = useState(
    "Generate an explanation after the recommendation is ready.",
  );
  const [profileChangeNote, setProfileChangeNote] = useState(
    "Rate the recommendation to teach the profile how warm or light you prefer the outfit.",
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
  const currentLocation = forecast?.location ?? null;
  const currentLocationLabel = currentLocation ? formatLocationLabel(currentLocation) : "";
  const isCurrentLocationSaved =
    currentLocationLabel.length > 0 &&
    favouriteLocations.some((location) => formatLocationLabel(location) === currentLocationLabel);
  const profileLearningCopy = getProfileLearningCopy(
    ratedRecommendations,
    temperatureOffsetC,
    profileStatus,
    feedbackStats,
  );
  const qualitySummary = getRecommendationQualitySummary(
    feedbackStats,
    temperatureOffsetC,
    ratedRecommendations,
  );
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
    setExplanationTone("neutral");
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
      publishWeatherPreviewForecast(nextForecast);
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
        setFavouriteStatus("");
        setFavouriteLocations([]);
        setDefaultFavouriteId(null);
        setRecommendationHistory([]);
        setFeedbackStats(emptyFeedbackStats());
        return;
      }

      try {
        setProfileStatus("Loading profile...");
        const [memory, history, favourites, stats] = await Promise.all([
          loadProfileMemory(user),
          loadRecommendationHistory(user),
          loadFavouriteLocations(user),
          loadFeedbackStats(user),
        ]);

        if (ignore) {
          return;
        }

        setRecommendationHistory(history);
        setFavouriteLocations(favourites);
        setFeedbackStats(stats);
        const storedDefaultId = getStoredDefaultFavouriteId(user.id);
        const defaultLocation = favourites.find((location) => location.favouriteId === storedDefaultId);

        if (defaultLocation) {
          setDefaultFavouriteId(defaultLocation.favouriteId);
          setLocationQuery(formatLocationLabel(defaultLocation));
          await selectLocation(defaultLocation, ignore);
        } else {
          setDefaultFavouriteId(null);
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
      setRecommendationHistory(await loadRecommendationHistory(user));
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
    setFeedbackStats((current) => projectFeedbackStats(current, feedback));
    setProfileChangeNote(getFeedbackChangeNote(feedback, nextTemperatureOffsetC));

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

      const nextFeedbackStats = await loadFeedbackStats(user);
      await saveProfileMemory(user, {
        starterProfile: form.starterProfile,
        ratedRecommendations: nextRatedRecommendations,
        temperatureOffsetC: nextTemperatureOffsetC,
        comfortSummary: buildComfortSummary(
          nextFeedbackStats,
          nextTemperatureOffsetC,
          nextRatedRecommendations,
        ),
      });

      setSaveStatus("Feedback saved to your profile.");
      setProfileStatus("Profile updated.");
      setFeedbackStats(nextFeedbackStats);
      setRecommendationHistory(await loadRecommendationHistory(user));
    } catch {
      setSaveStatus("Could not save feedback.");
    }
  }

  async function saveCurrentLocationAsFavourite() {
    if (!user) {
      setFavouriteStatus("Sign in to save favourite locations.");
      return;
    }

    if (!currentLocation) {
      setFavouriteStatus("Choose a location first.");
      return;
    }

    if (isCurrentLocationSaved) {
      setFavouriteStatus("This location is already saved.");
      return;
    }

    try {
      setFavouriteStatus("Saving location...");
      await saveFavouriteLocation(user, currentLocation);
      setFavouriteLocations(await loadFavouriteLocations(user));
      setFavouriteStatus("Location saved.");
    } catch {
      setFavouriteStatus("Could not save location.");
    }
  }

  async function deleteFavourite(location: FavouriteLocation) {
    if (!user) {
      return;
    }

    try {
      setFavouriteStatus("Removing location...");
      await deleteFavouriteLocation(user, location.favouriteId);

      if (defaultFavouriteId === location.favouriteId) {
        clearStoredDefaultFavouriteId(user.id);
        setDefaultFavouriteId(null);
      }

      setFavouriteLocations(await loadFavouriteLocations(user));
      setFavouriteStatus("Location removed.");
    } catch {
      setFavouriteStatus("Could not remove location.");
    }
  }

  function setDefaultFavourite(location: FavouriteLocation) {
    if (!user) {
      return;
    }

    setStoredDefaultFavouriteId(user.id, location.favouriteId);
    setDefaultFavouriteId(location.favouriteId);
    setFavouriteStatus("Default location set on this device.");
  }

  async function resetProfile() {
    if (!user) {
      setSaveStatus("Sign in to reset profile memory.");
      return;
    }

    try {
      setProfileStatus("Resetting profile...");
      await resetProfileMemory(user, form.starterProfile);
      setRatedRecommendations(0);
      setTemperatureOffsetC(0);
      setFeedbackStats(emptyFeedbackStats());
      setProfileStatus("Profile reset.");
      setSaveStatus("Profile memory reset.");
      setProfileChangeNote("Profile memory is fresh. New feedback will rebuild your comfort pattern.");
    } catch {
      setProfileStatus("Could not reset profile.");
    }
  }

  function repeatHistoryTiming(item: RecommendationHistoryItem) {
    if (!item.createdAtInput && !item.returnHomeTime) {
      setSaveStatus("This saved plan does not include repeatable timing yet.");
      return;
    }

    setForm((current) => ({
      ...current,
      mode: item.activityMode,
      startTime: item.createdAtInput ?? current.startTime,
      returnHomeTime: item.returnHomeTime ?? current.returnHomeTime,
    }));
    setSaveStatus("Plan timing restored. Choose location if needed.");
  }

  async function generateExplanation(question?: string) {
    if (!recommendationInput || !recommendation) {
      setExplanationTone("warning");
      setExplanationStatus("Choose a location first.");
      return;
    }

    if (!isFollowUpInScope(question)) {
      setExplanation(createOutOfScopeExplanation());
      setExplanationTone("warning");
      setExplanationStatus("Question outside ShortsAI scope.");
      return;
    }

    try {
      setExplanationTone("neutral");
      setExplanationStatus("Generating explanation...");
      const result = await requestExplanation({
        input: recommendationInput,
        recommendation,
        question,
      });

      setExplanation(result.explanation);
      setFollowUpQuestion("");
      setExplanationTone(result.scope === "out_of_scope" ? "warning" : "success");
      setExplanationStatus(
        result.scope === "out_of_scope"
          ? "Question outside ShortsAI scope."
          : result.limit?.exceeded
          ? "AI limit reached. Using deterministic fallback explanation."
          : result.source === "openrouter"
          ? "Explanation generated by OpenRouter."
          : "Using deterministic fallback explanation.",
      );
    } catch {
      setExplanationTone("warning");
      setExplanationStatus("Could not generate explanation.");
    }
  }

  function updateStartTime(nextStartTime: string) {
    setForm((current) => shiftPlannerStartTime(current, nextStartTime));
    resetExplanation();
  }

  function updateDuration(nextDuration: number) {
    setForm((current) => updatePlannerDuration(current, nextDuration));
    resetExplanation();
  }

  return (
    <section id="run-planner" className="demo-shell">
      <div className="demo-heading">
        <h2>The planner becomes the product.</h2>
        <p>
          Search a city, set the activity window, and ShortsAI turns forecast
          timing into an outfit for the plan and the way home.
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

          {user ? (
            <div className="location-tools field-wide">
              <div className="location-tool-row">
                <button
                  type="button"
                  onClick={saveCurrentLocationAsFavourite}
                  disabled={!currentLocation || isCurrentLocationSaved}
                >
                  {isCurrentLocationSaved ? "Saved" : "Save location"}
                </button>
                {favouriteStatus ? <p>{favouriteStatus}</p> : null}
              </div>
              {favouriteLocations.length > 0 ? (
                <details className="favourite-details">
                  <summary>Saved locations ({favouriteLocations.length})</summary>
                  <div className="favourite-list" aria-label="Favourite locations">
                    {favouriteLocations.map((location) => (
                      <article key={location.favouriteId}>
                        <button type="button" onClick={() => chooseLocation(location)}>
                          {formatLocationLabel(location)}
                        </button>
                        <div>
                          <button type="button" onClick={() => setDefaultFavourite(location)}>
                            {defaultFavouriteId === location.favouriteId ? "Default" : "Set default"}
                          </button>
                          <button type="button" onClick={() => deleteFavourite(location)}>
                            Delete
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </details>
              ) : null}
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

        <article
          className={
            recommendationInput
              ? `recommendation-panel ${getWeatherMoodClass(recommendationInput.current)}`
              : "recommendation-panel"
          }
          aria-live="polite"
        >
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
              <div className="profile-signal-list" aria-label="Profile scoring">
                <h4>Profile scoring</h4>
                <div>
                  {recommendation.profileSignals.map((signal) => (
                    <span key={signal.label} className={`signal-impact-${signal.impact}`}>
                      <strong>{signal.label}</strong>
                      {signal.value}
                    </span>
                  ))}
                </div>
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
                  <button type="button" onClick={() => generateExplanation()}>
                    Generate explanation
                  </button>
                </div>
                <p className={`explanation-message ${explanationTone}`}>
                  {explanation || explanationStatus}
                </p>
                {explanation ? <small>{explanationStatus}</small> : null}
                <div className="follow-up-row">
                  <input
                    type="text"
                    value={followUpQuestion}
                    onChange={(event) => setFollowUpQuestion(event.target.value)}
                    placeholder="Ask: do I need a hoodie?"
                    aria-label="Ask a follow-up question about this recommendation"
                  />
                  <button
                    type="button"
                    onClick={() => generateExplanation(followUpQuestion.trim())}
                    disabled={followUpQuestion.trim().length < 3}
                  >
                    Ask
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-recommendation">
              <h3>Choose a location to generate a recommendation.</h3>
            </div>
          )}
        </article>

        <div className="side-stack">
          <AuthPanel onUserChange={setUser} />
          <aside className="personalization-panel">
            <p className="panel-label">Personalization</p>
            {isPersonalized ? (
              <h3>Profile ready.</h3>
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
            <p className="profile-change-note">{profileChangeNote}</p>
            <button className="save-button" type="button" onClick={persistCurrentRecommendation}>
              Save recommendation
            </button>
            <p className="profile-note">
              {profileLearningCopy}
            </p>
            <div className="quality-panel" aria-label="Recommendation quality">
              <div>
                <span>Good rate</span>
                <strong>{feedbackStats.total > 0 ? `${feedbackStats.goodRate}%` : "New"}</strong>
              </div>
              <div>
                <span>Too cold</span>
                <strong>{feedbackStats.tooCold}</strong>
              </div>
              <div>
                <span>Too warm</span>
                <strong>{feedbackStats.tooWarm}</strong>
              </div>
            </div>
            <p className="quality-summary">{qualitySummary}</p>
            {user ? (
              <button className="reset-profile-button" type="button" onClick={resetProfile}>
                Reset profile memory
              </button>
            ) : null}
            <p className={isSaveWarning ? "save-status warning" : "save-status"}>
              {saveStatus}
            </p>
          </aside>
          <aside className="history-panel">
            <p className="panel-label">History</p>
            <h3>Recent plans</h3>
            {recommendationHistory.length > 0 ? (
              <div className="history-list">
                {recommendationHistory.map((item) => (
                  <article key={item.id}>
                    <span>{formatShortDate(item.createdAt)}</span>
                    <strong>{item.locationLabel}</strong>
                    <p>
                      {getActivityLabel(item.activityMode)} | {item.confidenceScore}% |{" "}
                      {item.headline}
                    </p>
                    {expandedHistoryId === item.id ? (
                      <div className="history-detail">
                        <p>Outfit: {item.outfitSummary}</p>
                        {item.createdAtInput ? <p>Start: {formatShortDate(item.createdAtInput)}</p> : null}
                        {item.returnHomeTime ? <p>Return: {formatShortDate(item.returnHomeTime)}</p> : null}
                      </div>
                    ) : null}
                    <div className="history-actions">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedHistoryId(expandedHistoryId === item.id ? null : item.id)
                        }
                      >
                        {expandedHistoryId === item.id ? "Hide details" : "Details"}
                      </button>
                      <button type="button" onClick={() => repeatHistoryTiming(item)}>
                        Repeat timing
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="history-empty">
                Save recommendations to build a useful planning history.
              </p>
            )}
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

function getActivityLabel(mode: ActivityMode) {
  if (mode === "running") {
    return "Run plan";
  }

  if (mode === "walking") {
    return "Walking plan";
  }

  return "Everyday / commute plan";
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getWeatherMoodClass(weather: WeatherSnapshot) {
  if (weather.rainProbabilityPercent >= 55) {
    return "weather-rain";
  }

  if (weather.windKph >= 25) {
    return "weather-wind";
  }

  if (weather.temperatureC >= 24) {
    return "weather-heat";
  }

  return "weather-calm";
}

function getDefaultFavouriteStorageKey(userId: string) {
  return `shorts-ai-default-location:${userId}`;
}

function getStoredDefaultFavouriteId(userId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(getDefaultFavouriteStorageKey(userId));
}

function setStoredDefaultFavouriteId(userId: string, favouriteId: string) {
  window.localStorage.setItem(getDefaultFavouriteStorageKey(userId), favouriteId);
}

function clearStoredDefaultFavouriteId(userId: string) {
  window.localStorage.removeItem(getDefaultFavouriteStorageKey(userId));
}
