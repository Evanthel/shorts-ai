"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthPanel } from "@/features/auth/auth-panel";
import { requestExplanation } from "@/features/recommendation/explanation";
import { requestRecommendation } from "@/features/recommendation/api";
import {
  acceptRecommendation,
  loadFeedbackStats,
  loadPendingFeedback,
  loadProfileMemory,
  loadRecommendationHistory,
  resetProfileMemory,
  saveFeedback,
  saveProfileMemory,
  saveRecommendationExposure,
  selectRecommendationVariant,
} from "@/features/recommendation/persistence";
import type { FeedbackStats, RecommendationHistoryItem } from "@/features/recommendation/persistence";
import {
  buildRecommendationInput,
  createInitialPlannerForm,
  createRecommendationResult,
  emptyFeedbackStats,
  fetchLocationForecast,
  formatLocationLabel,
  getContextTemperatureOffset,
  projectFeedbackStats,
  searchLocations,
  shortcutQuestions,
  starterProfiles,
  updateComfortMemory,
  updatePlannerDuration,
} from "@shorts-ai/core";
import { publishWeatherPreviewForecast } from "@/features/weather/preview-events";
import type {
  ActivityInput,
  ActivityMode,
  ActuallyWorn,
  ClothingItem,
  ComfortMemory,
  CommuteMode,
  FeedbackAdjustment,
  FeedbackProblemArea,
  FeedbackRating,
  FollowUpIntent,
  GeoLocation,
  LocationForecast,
  PlannerForm,
  RecommendationResult,
  RunningIntensity,
  StarterProfile,
} from "@shorts-ai/core";

const clothingLabels: Record<ClothingItem, string> = {
  shorts: "Shorts", long_pants: "Long pants", t_shirt: "T-shirt",
  long_sleeve: "Long sleeve", hoodie: "Hoodie", light_jacket: "Light jacket",
  rain_jacket: "Rain jacket", gloves: "Gloves", hat: "Hat",
};

type PendingFeedbackItem = {
  id: string;
  recommendationId: string | null;
  clientRequestId: string;
  dueAt: string;
  activity: ActivityInput;
  locationLabel: string;
};

export function RunningDemo() {
  const [form, setForm] = useState<PlannerForm>(() => createInitialPlannerForm());
  const [locationQuery, setLocationQuery] = useState("Warsaw");
  const [locationResults, setLocationResults] = useState<GeoLocation[]>([]);
  const [forecast, setForecast] = useState<LocationForecast | null>(null);
  const [weatherStatus, setWeatherStatus] = useState("Loading Warsaw forecast...");
  const [user, setUser] = useState<User | null>(null);
  const [ratedRecommendations, setRatedRecommendations] = useState(0);
  const [temperatureOffsetC, setTemperatureOffsetC] = useState(0);
  const [comfortMemory, setComfortMemory] = useState<ComfortMemory>({});
  const [feedbackStats, setFeedbackStats] = useState<FeedbackStats>(() => emptyFeedbackStats());
  const [history, setHistory] = useState<RecommendationHistoryItem[]>([]);
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [clientRequestId, setClientRequestId] = useState<string | null>(null);
  const [recommendationStatus, setRecommendationStatus] = useState("Waiting for forecast data.");
  const [pendingFeedback, setPendingFeedback] = useState<PendingFeedbackItem[]>([]);
  const [activePendingId, setActivePendingId] = useState<string | null>(null);
  const [activeFeedbackDue, setActiveFeedbackDue] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState<FeedbackRating | null>(null);
  const [actuallyWorn, setActuallyWorn] = useState<ActuallyWorn | null>(null);
  const [adjustment, setAdjustment] = useState<FeedbackAdjustment>("none");
  const [problemArea, setProblemArea] = useState<FeedbackProblemArea | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [explanation, setExplanation] = useState("");
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [explanationStatus, setExplanationStatus] = useState("Choose a shortcut or ask a question.");
  const [rejectedRequiredItems, setRejectedRequiredItems] = useState<ClothingItem[]>([]);
  const [isPending, startTransition] = useTransition();

  const recommendationInput = useMemo(() => forecast
    ? buildRecommendationInput(form, forecast, ratedRecommendations, temperatureOffsetC, comfortMemory)
    : null, [form, forecast, ratedRecommendations, temperatureOffsetC, comfortMemory]);
  const recommendation = result?.recommendation ?? null;
  const selectedVariant = result?.variants.find((variant) => variant.id === result.selectedVariantId) ?? null;
  const activePending = pendingFeedback.find((item) => item.id === activePendingId) ?? null;
  const contextualFollowUpNeeded = feedbackRating !== "good" || actuallyWorn === "with_changes" || actuallyWorn === "no";

  useEffect(() => {
    let ignore = false;
    void (async () => {
      try {
        const locations = await searchLocations("Warsaw");
        if (!locations[0] || ignore) return;
        const nextForecast = await fetchLocationForecast(locations[0]);
        if (ignore) return;
        setForecast(nextForecast);
        publishWeatherPreviewForecast(nextForecast);
        setWeatherStatus(`Using live forecast for ${formatLocationLabel(locations[0])}.`);
      } catch { if (!ignore) setWeatherStatus("Could not load the initial forecast."); }
    })();
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    let ignore = false;
    void (async () => {
      if (!user) {
        setHistory([]);
        setFeedbackStats(emptyFeedbackStats());
        setPendingFeedback(loadGuestPendingFeedback());
        return;
      }
      try {
        const [memory, nextHistory, stats, databasePending] = await Promise.all([
          loadProfileMemory(user), loadRecommendationHistory(user), loadFeedbackStats(user), loadPendingFeedback(user),
        ]);
        if (ignore) return;
        if (memory) {
          setRatedRecommendations(memory.ratedRecommendations);
          setTemperatureOffsetC(memory.temperatureOffsetC);
          setComfortMemory(memory.comfortMemory);
          setForm((current) => ({ ...current, starterProfile: memory.starterProfile }));
        }
        setHistory(nextHistory);
        setFeedbackStats(stats);
        setPendingFeedback(databasePending.map((item) => {
          const payload = asRecord(item.recommendation);
          const activity = asRecord(payload.activity) as ActivityInput;
          return {
            id: item.id,
            recommendationId: item.id,
            clientRequestId: item.id,
            dueAt: item.feedbackDueAt ?? new Date().toISOString(),
            activity,
            locationLabel: item.locationLabel,
          };
        }).filter((item) => Boolean(item.activity?.mode)));
      } catch { if (!ignore) setFeedbackStatus("Could not load profile history."); }
    })();
    return () => { ignore = true; };
  }, [user]);

  useEffect(() => {
    if (!recommendationInput) return;
    let ignore = false;
    const requestId = crypto.randomUUID();
    void (async () => {
      await Promise.resolve();
      if (ignore) return;
      setClientRequestId(requestId);
      setRecommendationStatus("Checking safe outfit variants...");
      setExplanation("");
      setResult(createRecommendationResult(recommendationInput));
      setRejectedRequiredItems([]);
      const next = await requestRecommendation({ clientRequestId: requestId, input: recommendationInput });
      if (ignore) return;
      let recommendationId = next.recommendationId ?? null;
      if (user && !recommendationId) {
        recommendationId = await saveRecommendationExposure(user, requestId, recommendationInput, next);
      }
      if (ignore) return;
      setResult({ ...next, ...(recommendationId ? { recommendationId } : {}) });
      setRecommendationStatus(next.source === "model" ? `Ranked by ${next.modelVersion}.` : "Safe variants ranked by ShortsAI rules.");
    })().catch(() => { if (!ignore) setRecommendationStatus("Using offline ShortsAI rules."); });
    return () => { ignore = true; };
  }, [recommendationInput, user]);

  function updateForm<Key extends keyof PlannerForm>(key: Key, value: PlannerForm[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function searchForLocation() {
    if (locationQuery.trim().length < 2) return;
    startTransition(async () => {
      try {
        setWeatherStatus("Searching locations...");
        const matches = await searchLocations(locationQuery);
        setLocationResults(matches);
        setWeatherStatus(matches.length ? "Choose a matching location." : "No locations found.");
      } catch { setWeatherStatus("Location search failed."); }
    });
  }

  function chooseLocation(location: GeoLocation) {
    startTransition(async () => {
      try {
        setWeatherStatus(`Loading forecast for ${formatLocationLabel(location)}...`);
        const next = await fetchLocationForecast(location);
        setForecast(next);
        publishWeatherPreviewForecast(next);
        setLocationQuery(formatLocationLabel(location));
        setLocationResults([]);
        setWeatherStatus(`Using live forecast for ${formatLocationLabel(location)}.`);
      } catch { setWeatherStatus("Weather forecast failed."); }
    });
  }

  function chooseVariant(variantId: string) {
    void selectRecommendationVariant(user, result?.recommendationId ?? null, variantId).catch(() => {
      setRecommendationStatus("Variant selected locally; preference sync failed.");
    });
    setResult((current) => {
      const variant = current?.variants.find((item) => item.id === variantId);
      if (!current || !variant) return current;
      return {
        ...current,
        selectedVariantId: variantId,
        recommendation: { ...current.recommendation, outfit: variant.outfit, ...(variant.running ? { running: variant.running } : {}) },
      };
    });
  }

  async function confirmOutfit() {
    if (!result || !recommendationInput || !clientRequestId) return;
    try {
      const dueAt = await acceptRecommendation(user, result.recommendationId ?? null, result.selectedVariantId, recommendationInput.activity.returnHomeTime);
      const pending: PendingFeedbackItem = {
        id: result.recommendationId ?? clientRequestId,
        recommendationId: result.recommendationId ?? null,
        clientRequestId,
        dueAt,
        activity: recommendationInput.activity,
        locationLabel: recommendationInput.current.locationLabel,
      };
      setPendingFeedback((current) => [pending, ...current.filter((item) => item.id !== pending.id)]);
      if (!user) saveGuestPendingFeedback(pending);
      setRecommendationStatus(rejectedRequiredItems.length
        ? `Outfit accepted with an active safety warning for ${rejectedRequiredItems.map((item) => clothingLabels[item]).join(", ")}. Feedback is due ${formatDate(dueAt)}.`
        : `Outfit accepted. Feedback is due ${formatDate(dueAt)}.`);
      if (user) setHistory(await loadRecommendationHistory(user));
    } catch { setRecommendationStatus("Could not accept this outfit."); }
  }

  async function ask(intent?: FollowUpIntent) {
    if (!recommendationInput || !recommendation || !result) return;
    const question = followUpQuestion.trim();
    if (!intent && question.length < 3) return;
    try {
      setExplanationStatus(intent ? "Explaining this plan..." : "Classifying your question...");
      const response = await requestExplanation({
        input: recommendationInput,
        recommendation,
        recommendationResult: result,
        recommendationId: result.recommendationId,
        source: intent ? "shortcut" : "text",
        ...(intent ? { intent } : { question }),
      });
      setExplanation(response.explanation);
      setFollowUpQuestion("");
      setExplanationStatus(response.scope === "out_of_scope" ? "That question is outside this recommendation." : "Explanation ready.");
      if (response.recommendationResult) {
        setResult({ ...response.recommendationResult, recommendationId: result.recommendationId });
      }
    } catch { setExplanationStatus("Could not explain this recommendation."); }
  }

  async function submitPostActivityFeedback() {
    if (!activePending || !activeFeedbackDue || !feedbackRating || !actuallyWorn) return;
    const finalAdjustment: FeedbackAdjustment = actuallyWorn === "no"
      ? "did_not_follow"
      : actuallyWorn === "with_changes" && adjustment === "none" ? "added_layer" : adjustment;
    try {
      await saveFeedback(user, activePending.recommendationId, {
        rating: feedbackRating,
        actuallyWorn,
        adjustment: finalAdjustment,
        problemAreas: problemArea ? [problemArea] : [],
        source: "web",
      });
      let nextMemory = comfortMemory;
      let nextRated = ratedRecommendations;
      if (actuallyWorn !== "no" && finalAdjustment !== "did_not_follow") {
        nextMemory = updateComfortMemory(comfortMemory, activePending.activity, feedbackRating);
        nextRated += 1;
        setComfortMemory(nextMemory);
        setRatedRecommendations(nextRated);
        setFeedbackStats((current) => projectFeedbackStats(current, feedbackRating));
      }
      if (user) {
        await saveProfileMemory(user, {
          starterProfile: form.starterProfile,
          ratedRecommendations: nextRated,
          temperatureOffsetC,
          comfortMemory: nextMemory,
        });
        setFeedbackStats(await loadFeedbackStats(user));
      } else removeGuestPendingFeedback(activePending.clientRequestId);
      setPendingFeedback((current) => current.filter((item) => item.id !== activePending.id));
      setActivePendingId(null);
      setFeedbackRating(null);
      setActuallyWorn(null);
      setAdjustment("none");
      setProblemArea(null);
      setFeedbackStatus("Post-activity feedback saved.");
    } catch { setFeedbackStatus("Could not save feedback."); }
  }

  async function resetProfile() {
    await resetProfileMemory(user, form.starterProfile);
    setComfortMemory({});
    setTemperatureOffsetC(0);
    setRatedRecommendations(0);
    setFeedbackStats(emptyFeedbackStats());
    setFeedbackStatus("Comfort memory reset.");
  }

  return (
    <section id="run-planner" className="demo-shell">
      <div className="demo-heading">
        <h2>Plan the activity, then choose your comfort level.</h2>
        <p>ShortsAI creates safe lighter, standard, and warmer options for the full weather window.</p>
      </div>
      <div className="demo-workspace">
        <form className="demo-form" aria-label="Outfit recommendation controls">
          <div className="field field-wide">
            <label htmlFor="locationSearch">Search location</label>
            <div className="search-row">
              <input id="locationSearch" type="search" value={locationQuery} onChange={(event) => setLocationQuery(event.target.value)} />
              <button type="button" onClick={searchForLocation} disabled={isPending}>Search</button>
            </div>
          </div>
          <p className="forecast-status field-wide" aria-live="polite">{weatherStatus}</p>
          {locationResults.length > 0 ? <div className="location-results field-wide"><div>{locationResults.map((location) => (
            <button key={location.id} type="button" onClick={() => chooseLocation(location)}>{formatLocationLabel(location)}</button>
          ))}</div></div> : null}
          <Field label="Activity" id="activityMode">
            <select id="activityMode" value={form.mode} onChange={(event) => updateForm("mode", event.target.value as ActivityMode)}>
              <option value="running">Run</option><option value="walking">Walk</option><option value="commute">Commute</option>
            </select>
          </Field>
          <Field label="Starter profile" id="profile">
            <select id="profile" value={form.starterProfile} onChange={(event) => updateForm("starterProfile", event.target.value as StarterProfile)}>
              {Object.values(starterProfiles).map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
            </select>
          </Field>
          {form.mode === "running" ? <Field label="Intensity" id="intensity">
            <select id="intensity" value={form.intensity} onChange={(event) => updateForm("intensity", event.target.value as RunningIntensity)}>
              <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
            </select>
          </Field> : null}
          {form.mode === "commute" ? <>
            <Field label="Commute mode" id="commuteMode">
              <select id="commuteMode" value={form.commuteMode} onChange={(event) => updateForm("commuteMode", event.target.value as CommuteMode)}>
                <option value="walking">Walking</option><option value="transit">Transit</option><option value="bicycle">Bicycle</option><option value="car">Car</option>
              </select>
            </Field>
            <Field label="Outdoor exposure (minutes)" id="outdoorMinutes">
              <input id="outdoorMinutes" type="number" min="0" max="1440" value={form.outdoorMinutes} onChange={(event) => updateForm("outdoorMinutes", Number(event.target.value))} />
            </Field>
            <label className="field"><span>Carry an extra layer</span><input type="checkbox" checked={form.canCarryLayer} onChange={(event) => updateForm("canCarryLayer", event.target.checked)} /></label>
          </> : null}
          <Field label="Start time" id="startTime"><input id="startTime" type="datetime-local" value={form.startTime} onChange={(event) => updateForm("startTime", event.target.value)} /></Field>
          <Field label="Duration (minutes)" id="duration"><input id="duration" type="number" min="15" max="1440" step="5" value={form.durationMinutes} onChange={(event) => setForm((current) => updatePlannerDuration(current, Number(event.target.value)))} /></Field>
          <Field label="Return home" id="returnHomeTime"><input id="returnHomeTime" type="datetime-local" value={form.returnHomeTime} onChange={(event) => updateForm("returnHomeTime", event.target.value)} /></Field>
        </form>

        <article className="recommendation-panel" aria-live="polite">
          {recommendation && recommendationInput && result ? <>
            <div className="panel-topline"><span>{recommendationInput.current.locationLabel}</span><strong>{recommendation.confidenceScore}% confidence</strong></div>
            <h3>{recommendation.headline}</h3>
            <p className="activity-context">{activityLabel(form.mode)} · {result.engineVersion} · {result.source} · safety {result.safetyPolicyVersion}</p>
            <div className="weather-strip live-weather">
              <span>Start feels like {recommendationInput.current.feelsLikeC} C</span>
              <span>Wind {recommendationInput.current.windKph} km/h</span>
              <span>Return feels like {recommendationInput.forecastAtReturn.feelsLikeC} C</span>
            </div>
            <div className="feedback-actions" aria-label="Outfit variants">
              {result.variants.map((variant) => <button key={variant.id} type="button" className={variant.id === result.selectedVariantId ? "active" : ""} onClick={() => chooseVariant(variant.id)}>
                {variant.kind === "standard" ? "Standard" : variant.kind === "lighter" ? "Choose lighter" : "Choose warmer"}
              </button>)}
            </div>
            {recommendation.running ? <div className="phase-grid">
              <OutfitPhase title="Warm-up" items={recommendation.running.warmUp} />
              <OutfitPhase title="Main run" items={recommendation.running.mainRun} />
              <OutfitPhase title="Post-run" items={recommendation.running.postRun} />
            </div> : <div className="phase-grid single-phase"><OutfitPhase title="Recommended outfit" items={selectedVariant?.outfit ?? recommendation.outfit} /></div>}
            {selectedVariant?.requiredItems.length ? <div className="profile-change-note">
              <p>Safety required: {selectedVariant.requiredItems.map((item) => clothingLabels[item]).join(", ")}.</p>
              <div className="feedback-actions">{selectedVariant.requiredItems.map((item) => <button key={item} type="button" onClick={() => setRejectedRequiredItems((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])}>
                {rejectedRequiredItems.includes(item) ? `Warning active: ${clothingLabels[item]}` : `I won't wear ${clothingLabels[item]}`}
              </button>)}</div>
              {rejectedRequiredItems.length ? <p>The rejected item remains recommended and its safety warning stays active.</p> : null}
            </div> : null}
            <div className="risk-list"><h4>Safety checks</h4>{recommendation.riskWarnings.length ? recommendation.riskWarnings.map((warning) => <p key={warning.type}><strong>{warning.severity}</strong>{warning.message}</p>) : <p>No major weather risks detected.</p>}</div>
            <button className="save-button" type="button" onClick={confirmOutfit}>I&apos;ll wear this</button>
            <p className="save-status">{recommendationStatus}</p>
            <details className="explanation-panel">
              <summary>Why this outfit? Ask ShortsAI</summary>
              <div className="feedback-actions">{shortcutQuestions[form.mode].map((shortcut) => <button key={shortcut.intent} type="button" onClick={() => ask(shortcut.intent)}>{shortcut.label}</button>)}</div>
              <p className="explanation-message">{explanation || explanationStatus}</p>
              <div className="follow-up-row"><input value={followUpQuestion} onChange={(event) => setFollowUpQuestion(event.target.value)} maxLength={300} placeholder="Ask another question" aria-label="Ask another question" /><button type="button" onClick={() => ask()} disabled={followUpQuestion.trim().length < 3}>Ask</button></div>
            </details>
          </> : <div className="empty-recommendation"><h3>Choose a location to generate a recommendation.</h3></div>}
        </article>

        <div className="side-stack">
          <AuthPanel onUserChange={setUser} />
          <aside className="personalization-panel">
            <p className="panel-label">Post-activity feedback</p>
            <h3>{pendingFeedback.length ? "Rate your last outfit" : "No feedback due"}</h3>
            {pendingFeedback.map((pending) => <button key={pending.id} type="button" onClick={() => {
              setActivePendingId(pending.id);
              setActiveFeedbackDue(new Date(pending.dueAt).getTime() <= Date.now());
            }}>
              {pending.locationLabel} · due {formatDate(pending.dueAt)}
            </button>)}
            {activePending ? <div className="feedback-flow">
              {!activeFeedbackDue ? <p>Feedback opens after your return: {formatDate(activePending.dueAt)}.</p> : <>
              <p>How did the outfit feel?</p>
              <ChoiceRow values={["too_cold", "good", "too_warm"]} selected={feedbackRating} onSelect={(value) => setFeedbackRating(value as FeedbackRating)} />
              <p>Did you wear the recommended outfit?</p>
              <ChoiceRow values={["yes", "with_changes", "no"]} selected={actuallyWorn} onSelect={(value) => setActuallyWorn(value as ActuallyWorn)} />
              {contextualFollowUpNeeded && feedbackRating && actuallyWorn ? <>
                <label>What changed?<select value={adjustment} onChange={(event) => setAdjustment(event.target.value as FeedbackAdjustment)}>
                  <option value="none">No clothing change</option><option value="added_layer">Added a layer</option><option value="removed_layer">Removed a layer</option><option value="changed_top">Changed the top</option><option value="changed_bottom">Changed the bottom</option>
                </select></label>
                <label>Main problem area<select value={problemArea ?? ""} onChange={(event) => setProblemArea((event.target.value || null) as FeedbackProblemArea | null)}>
                  <option value="">Not specified</option><option value="upper">Upper body</option><option value="lower">Lower body</option><option value="hands_head">Hands or head</option><option value="start">At the start</option><option value="during">During activity</option><option value="return">On return</option>
                </select></label>
              </> : null}
              <button type="button" onClick={submitPostActivityFeedback} disabled={!feedbackRating || !actuallyWorn}>Save feedback</button>
              </>}
            </div> : null}
            <p>{feedbackStatus}</p>
            <p>Current context offset: {recommendationInput ? getContextTemperatureOffset(recommendationInput.activity, comfortMemory, temperatureOffsetC) : 0} C. Good rate: {feedbackStats.total ? `${feedbackStats.goodRate}%` : "new"}.</p>
            {user ? <button type="button" onClick={resetProfile}>Reset profile memory</button> : <p>Guest feedback stays on this device and is never used for training.</p>}
          </aside>
          <aside className="history-panel"><p className="panel-label">History</p><h3>Recent plans</h3>{history.length ? history.map((item) => <article key={item.id}><strong>{item.locationLabel}</strong><p>{activityLabel(item.activityMode)} · {item.headline}</p>{item.feedbackDueAt ? <span>Feedback due {formatDate(item.feedbackDueAt)}</span> : null}</article>) : <p>No authenticated history yet.</p>}</aside>
        </div>
      </div>
    </section>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return <div className="field"><label htmlFor={id}>{label}</label>{children}</div>;
}

function OutfitPhase({ title, items }: { title: string; items: ClothingItem[] }) {
  return <section className="phase"><span>{title}</span><p>{items.map((item) => clothingLabels[item]).join(", ")}</p></section>;
}

function ChoiceRow({ values, selected, onSelect }: { values: string[]; selected: string | null; onSelect: (value: string) => void }) {
  return <div className="feedback-actions">{values.map((value) => <button key={value} type="button" className={selected === value ? "active" : ""} onClick={() => onSelect(value)}>{value.replaceAll("_", " ")}</button>)}</div>;
}

function activityLabel(mode: ActivityMode) {
  return mode === "running" ? "Run" : mode === "walking" ? "Walk" : "Commute";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

const GUEST_PENDING_KEY = "shortsai.pending-feedback.v2";

function loadGuestPendingFeedback(): PendingFeedbackItem[] {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(GUEST_PENDING_KEY) ?? "[]");
    return Array.isArray(value) ? value as PendingFeedbackItem[] : [];
  } catch { return []; }
}

function saveGuestPendingFeedback(item: PendingFeedbackItem) {
  const current = loadGuestPendingFeedback();
  window.localStorage.setItem(GUEST_PENDING_KEY, JSON.stringify([item, ...current.filter((pending) => pending.id !== item.id)].slice(0, 20)));
}

function removeGuestPendingFeedback(clientRequestId: string) {
  window.localStorage.setItem(GUEST_PENDING_KEY, JSON.stringify(loadGuestPendingFeedback().filter((item) => item.clientRequestId !== clientRequestId)));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
