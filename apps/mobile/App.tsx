import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import type { User } from "@supabase/supabase-js";
import {
  buildRecommendationInput,
  createInitialPlannerForm,
  createRecommendationResult,
  emptyFeedbackStats,
  fetchLocationForecast,
  formatClockTime,
  formatLocationLabel,
  getContextTemperatureOffset,
  mergeClockTimeIntoDate,
  projectFeedbackStats,
  searchLocations,
  shiftPlannerStartTime,
  shortcutQuestions,
  starterProfiles,
  updateComfortMemory,
  updatePlannerDuration,
} from "@shorts-ai/core";
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
import {
  createMobileSupabaseClient,
  exchangeAuthUrl,
  getAuthRedirectUrl,
  isSupabaseConfigured,
} from "./src/lib/supabase";
import { requestMobileExplanation } from "./src/services/explanation";
import {
  completeLocalPendingFeedback,
  loadLocalPendingFeedback,
  scheduleFeedbackNotification,
  type LocalPendingFeedback,
} from "./src/services/notifications";
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
} from "./src/services/persistence";
import type { FeedbackStats, RecommendationHistoryItem } from "./src/services/persistence";
import { requestMobileRecommendation } from "./src/services/recommendation";

const labels: Record<ClothingItem, string> = {
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

type PendingItem = {
  id: string;
  clientRequestId: string;
  recommendationId: string | null;
  selectedVariantId: string;
  dueAt: string;
  activity: ActivityInput;
  locationLabel: string;
};

type TimePickerTarget = "start" | "return";

export default function App() {
  const scrollRef = useRef<ScrollView>(null);
  const recommendationY = useRef(0);
  const wasPlanComplete = useRef(false);
  const shouldRevealRecommendation = useRef(false);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [form, setForm] = useState<PlannerForm>(() => createInitialPlannerForm());
  const [selectedStarterProfile, setSelectedStarterProfile] = useState<StarterProfile | null>(null);
  const [selectedRunningIntensity, setSelectedRunningIntensity] = useState<RunningIntensity | null>(null);
  const [selectedCommuteMode, setSelectedCommuteMode] = useState<CommuteMode | null>(null);
  const [outdoorMinutesInput, setOutdoorMinutesInput] = useState("");
  const [canCarryLayerChoice, setCanCarryLayerChoice] = useState<boolean | null>(null);
  const [locationQuery, setLocationQuery] = useState("");
  const [locationSearchOpen, setLocationSearchOpen] = useState(false);
  const [locations, setLocations] = useState<GeoLocation[]>([]);
  const [forecast, setForecast] = useState<LocationForecast | null>(null);
  const [weatherStatus, setWeatherStatus] = useState("Finding your location...");
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [clientRequestId, setClientRequestId] = useState<string | null>(null);
  const [recommendationStatus, setRecommendationStatus] = useState("Waiting for weather.");
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [authStatus, setAuthStatus] = useState(isSupabaseConfigured() ? "Sign in to sync training-quality feedback." : "Supabase is not configured.");
  const [ratedRecommendations, setRatedRecommendations] = useState(0);
  const [temperatureOffsetC, setTemperatureOffsetC] = useState(0);
  const [comfortMemory, setComfortMemory] = useState<ComfortMemory>({});
  const [feedbackStats, setFeedbackStats] = useState<FeedbackStats>(() => emptyFeedbackStats());
  const [history, setHistory] = useState<RecommendationHistoryItem[]>([]);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [activePendingId, setActivePendingId] = useState<string | null>(null);
  const [activeFeedbackDue, setActiveFeedbackDue] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState<FeedbackRating | null>(null);
  const [actuallyWorn, setActuallyWorn] = useState<ActuallyWorn | null>(null);
  const [adjustment, setAdjustment] = useState<FeedbackAdjustment>("none");
  const [problemArea, setProblemArea] = useState<FeedbackProblemArea | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [explanation, setExplanation] = useState("");
  const [question, setQuestion] = useState("");
  const [explanationStatus, setExplanationStatus] = useState("Choose a shortcut or ask another question.");
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [rejectedRequiredItems, setRejectedRequiredItems] = useState<ClothingItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [timePickerTarget, setTimePickerTarget] = useState<TimePickerTarget | null>(null);
  const [timePickerValue, setTimePickerValue] = useState(new Date());

  const missingPlanFields = [
    !forecast ? "location" : null,
    !selectedStarterProfile ? "comfort profile" : null,
    form.mode === "running" && !selectedRunningIntensity ? "intensity" : null,
    form.mode === "commute" && !selectedCommuteMode ? "commute mode" : null,
    form.mode === "commute" && !outdoorMinutesInput.trim() ? "outdoor time" : null,
    form.mode === "commute" && canCarryLayerChoice === null ? "extra layer choice" : null,
  ].filter((value): value is string => Boolean(value));
  const planComplete = missingPlanFields.length === 0;
  const recommendationInput = useMemo(() => forecast && planComplete
    ? buildRecommendationInput(form, forecast, ratedRecommendations, temperatureOffsetC, comfortMemory)
    : null, [form, forecast, ratedRecommendations, temperatureOffsetC, comfortMemory, planComplete]);
  const recommendation = result?.recommendation ?? null;
  const selectedVariant = result?.variants.find((variant) => variant.id === result.selectedVariantId) ?? null;
  const activePending = pendingItems.find((item) => item.id === activePendingId) ?? null;
  const needsContext = feedbackRating !== "good" || actuallyWorn === "with_changes" || actuallyWorn === "no";

  useEffect(() => {
    let ignore = false;
    void (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          if (!ignore) {
            setWeatherStatus("Location access is off. Search for a city.");
            setLocationSearchOpen(true);
          }
          return;
        }
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        let address: Location.LocationGeocodedAddress | undefined;
        try {
          [address] = await Location.reverseGeocodeAsync(position.coords);
        } catch {
          address = undefined;
        }
        const currentLocation: GeoLocation = {
          id: locationId(position.coords.latitude, position.coords.longitude),
          name: address?.city || address?.district || address?.name || "Current location",
          country: address?.country || "",
          ...(address?.region ? { admin1: address.region } : {}),
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "auto",
        };
        const next = await fetchLocationForecast(currentLocation);
        if (!ignore) {
          const label = formatLocationLabel(next.location);
          setForecast(next);
          setLocationQuery(label);
          setWeatherStatus(`Using your location: ${label}`);
        }
      } catch {
        if (!ignore) {
          setWeatherStatus("Could not use your location. Search for a city.");
          setLocationSearchOpen(true);
        }
      }
    })();
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createMobileSupabaseClient();
    void supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    const handleUrl = ({ url }: { url: string }) => void exchangeAuthUrl(url).catch(() => setAuthStatus("Could not complete sign-in."));
    void Linking.getInitialURL().then((url) => { if (url) handleUrl({ url }); });
    const linkSubscription = Linking.addEventListener("url", handleUrl);
    return () => { data.subscription.unsubscribe(); linkSubscription.remove(); };
  }, []);

  useEffect(() => {
    const selectFromNotification = (response: Notifications.NotificationResponse | null) => {
      const id = response?.notification.request.content.data?.clientRequestId;
      if (typeof id === "string") {
        setActivePendingId(id);
        setActiveFeedbackDue(true);
        setFeedbackOpen(true);
      }
    };
    void Notifications.getLastNotificationResponseAsync().then(selectFromNotification);
    const subscription = Notifications.addNotificationResponseReceivedListener(selectFromNotification);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let ignore = false;
    void (async () => {
      const local = (await loadLocalPendingFeedback()).map(toPendingItem);
      if (!user) {
        if (!ignore) {
          setPendingItems(local);
          setHistory([]);
          setFeedbackStats(emptyFeedbackStats());
        }
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
        const localIds = new Set(local.map((item) => item.recommendationId).filter(Boolean));
        const remote: PendingItem[] = databasePending.filter((item) => !localIds.has(item.id)).map((item) => {
          const payload = record(item.recommendation);
          return {
            id: item.id,
            clientRequestId: item.id,
            recommendationId: item.id,
            selectedVariantId: String(payload.selectedVariantId ?? "variant-standard"),
            dueAt: item.feedbackDueAt ?? new Date().toISOString(),
            activity: record(payload.activity) as ActivityInput,
            locationLabel: item.locationLabel,
          };
        }).filter((item) => Boolean(item.activity?.mode));
        setPendingItems([...local, ...remote]);
        setHistory(nextHistory);
        setFeedbackStats(stats);
      } catch {
        if (!ignore) setFeedbackStatus("Could not load saved profile.");
      }
    })();
    return () => { ignore = true; };
  }, [user]);

  useEffect(() => {
    if (planComplete && !wasPlanComplete.current) shouldRevealRecommendation.current = true;
    if (!planComplete) {
      shouldRevealRecommendation.current = false;
      setResult(null);
      setClientRequestId(null);
      setRecommendationStatus("Complete the plan to create a recommendation.");
    }
    wasPlanComplete.current = planComplete;
  }, [planComplete]);

  useEffect(() => {
    if (!recommendationInput) return;
    let ignore = false;
    const requestTimer = setTimeout(() => {
      if (ignore) return;
      const requestId = uuid();
      setClientRequestId(requestId);
      setResult(createRecommendationResult(recommendationInput));
      setRejectedRequiredItems([]);
      setRecommendationStatus("Checking safe variants...");
      setExplanation("");
      if (shouldRevealRecommendation.current) {
        shouldRevealRecommendation.current = false;
        if (revealTimer.current) clearTimeout(revealTimer.current);
        revealTimer.current = setTimeout(() => {
          scrollRef.current?.scrollTo({ y: Math.max(0, recommendationY.current - 10), animated: true });
        }, 350);
      }
      void (async () => {
        const next = await requestMobileRecommendation({ clientRequestId: requestId, input: recommendationInput });
        if (ignore) return;
        let recommendationId = next.recommendationId ?? null;
        if (user && !recommendationId) recommendationId = await saveRecommendationExposure(user, requestId, recommendationInput, next);
        if (!ignore) {
          setResult({ ...next, ...(recommendationId ? { recommendationId } : {}) });
          setRecommendationStatus(next.source === "model" ? `Ranked by ${next.modelVersion}.` : "Ranked by safe ShortsAI rules.");
        }
      })().catch(() => { if (!ignore) setRecommendationStatus("Using offline ShortsAI rules."); });
    }, 300);
    return () => {
      ignore = true;
      clearTimeout(requestTimer);
    };
  }, [recommendationInput, user]);

  useEffect(() => () => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
  }, []);

  function updateForm<Key extends keyof PlannerForm>(key: Key, value: PlannerForm[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function findLocations() {
    if (locationQuery.trim().length < 2) return;
    setBusy(true);
    try {
      const matches = await searchLocations(locationQuery);
      setLocations(matches);
      setWeatherStatus(matches.length ? "Choose a location." : "No locations found.");
    } catch {
      setWeatherStatus("Location search failed.");
    } finally {
      setBusy(false);
    }
  }

  async function chooseLocation(location: GeoLocation) {
    setBusy(true);
    try {
      const next = await fetchLocationForecast(location);
      const label = formatLocationLabel(next.location);
      setForecast(next);
      setLocationQuery(label);
      setLocations([]);
      setLocationSearchOpen(false);
      setWeatherStatus(`Live forecast: ${label}`);
    } catch {
      setWeatherStatus("Weather forecast failed.");
    } finally {
      setBusy(false);
    }
  }

  function openTimePicker(target: TimePickerTarget) {
    const value = new Date(target === "start" ? form.startTime : form.returnHomeTime);
    setTimePickerValue(Number.isFinite(value.getTime()) ? value : new Date());
    setTimePickerTarget(target);
  }

  function applyTimePicker() {
    if (!timePickerTarget) return;
    const clock = `${String(timePickerValue.getHours()).padStart(2, "0")}:${String(timePickerValue.getMinutes()).padStart(2, "0")}`;
    setForm((current) => timePickerTarget === "start"
      ? shiftPlannerStartTime(current, mergeClockTimeIntoDate(current.startTime, clock))
      : { ...current, returnHomeTime: mergeClockTimeIntoDate(current.returnHomeTime, clock) });
    setTimePickerTarget(null);
  }

  function chooseVariant(id: string) {
    void selectRecommendationVariant(user, result?.recommendationId ?? null, id).catch(() => {
      setRecommendationStatus("Variant selected locally; preference sync failed.");
    });
    setResult((current) => {
      const variant = current?.variants.find((item) => item.id === id);
      if (!current || !variant) return current;
      return {
        ...current,
        selectedVariantId: id,
        recommendation: {
          ...current.recommendation,
          outfit: variant.outfit,
          ...(variant.running ? { running: variant.running } : {}),
        },
      };
    });
  }

  async function acceptOutfit() {
    if (!result || !recommendationInput || !clientRequestId) return;
    try {
      const dueAt = await acceptRecommendation(user, result.recommendationId ?? null, result.selectedVariantId, recommendationInput.activity.returnHomeTime);
      const local: LocalPendingFeedback = {
        clientRequestId,
        recommendationId: result.recommendationId ?? null,
        selectedVariantId: result.selectedVariantId,
        dueAt,
        input: recommendationInput,
        result,
      };
      const notification = await scheduleFeedbackNotification(local);
      const pending = toPendingItem(local);
      setPendingItems((current) => [pending, ...current.filter((item) => item.id !== pending.id)]);
      const acceptancePrefix = rejectedRequiredItems.length
        ? `Accepted with an active safety warning for ${rejectedRequiredItems.map((item) => labels[item]).join(", ")}.`
        : "Outfit accepted.";
      setRecommendationStatus(notification.scheduled
        ? `${acceptancePrefix} A reminder is set for ${formatDate(dueAt)}.`
        : `${acceptancePrefix} Notifications are off; feedback will stay in the app.`);
      if (user) setHistory(await loadRecommendationHistory(user));
    } catch {
      setRecommendationStatus("Could not accept this outfit.");
    }
  }

  async function ask(intent?: FollowUpIntent) {
    if (!recommendationInput || !recommendation || !result || (!intent && question.trim().length < 3)) return;
    try {
      setExplanationStatus(intent ? "Explaining..." : "Classifying your question...");
      const response = await requestMobileExplanation({
        input: recommendationInput,
        recommendation,
        recommendationResult: result,
        recommendationId: result.recommendationId,
        source: intent ? "shortcut" : "text",
        ...(intent ? { intent } : { question: question.trim() }),
      });
      setExplanation(response.explanation);
      setQuestion("");
      setExplanationStatus(response.scope === "out_of_scope"
        ? "That question is outside this recommendation."
        : response.source === "fallback" ? "Explanation ready offline." : "Explanation ready.");
      if (response.recommendationResult) setResult({ ...response.recommendationResult, recommendationId: result.recommendationId });
    } catch {
      setExplanationStatus("Could not explain this recommendation.");
    }
  }

  function toggleExplanation() {
    const opening = !explanationOpen;
    setExplanationOpen(opening);
    if (opening && !explanation) void ask("why_outfit");
  }

  function openFeedback(item?: PendingItem) {
    const next = item ?? pendingItems[0];
    if (next) {
      setActivePendingId(next.id);
      setActiveFeedbackDue(new Date(next.dueAt).getTime() <= Date.now());
    }
    setFeedbackOpen(true);
  }

  async function submitFeedback() {
    if (!activePending || !activeFeedbackDue || !feedbackRating || !actuallyWorn) return;
    const finalAdjustment: FeedbackAdjustment = actuallyWorn === "no" ? "did_not_follow" : actuallyWorn === "with_changes" && adjustment === "none" ? "added_layer" : adjustment;
    try {
      await saveFeedback(user, activePending.recommendationId, {
        rating: feedbackRating,
        actuallyWorn,
        adjustment: finalAdjustment,
        problemAreas: problemArea ? [problemArea] : [],
        source: "mobile",
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
        await saveProfileMemory(user, { starterProfile: form.starterProfile, ratedRecommendations: nextRated, temperatureOffsetC, comfortMemory: nextMemory });
        setFeedbackStats(await loadFeedbackStats(user));
      }
      await completeLocalPendingFeedback(activePending.clientRequestId);
      setPendingItems((current) => current.filter((item) => item.id !== activePending.id));
      setActivePendingId(null);
      setFeedbackRating(null);
      setActuallyWorn(null);
      setAdjustment("none");
      setProblemArea(null);
      setFeedbackStatus("Post-activity feedback saved.");
      setFeedbackOpen(false);
    } catch {
      setFeedbackStatus("Could not save feedback.");
    }
  }

  async function sendMagicLink() {
    if (!isSupabaseConfigured() || !email.trim()) return;
    const { error } = await createMobileSupabaseClient().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: getAuthRedirectUrl() } });
    setAuthStatus(error ? "Could not send sign-in link." : "Check your email for the sign-in link.");
  }

  async function signOut() {
    await createMobileSupabaseClient().auth.signOut();
    setAuthStatus("Signed out. Guest feedback stays on this device.");
  }

  async function resetMemory() {
    await resetProfileMemory(user, form.starterProfile);
    setComfortMemory({});
    setTemperatureOffsetC(0);
    setRatedRecommendations(0);
    setFeedbackStats(emptyFeedbackStats());
    setFeedbackStatus("Comfort memory reset.");
  }

  return <SafeAreaView style={styles.safe}>
    <StatusBar style="dark" />
    <View style={styles.topBar}>
      <View>
        <Text style={styles.eyebrow}>SHORTSAI</Text>
        <Text style={styles.title}>Dress for your plan.</Text>
      </View>
      <View style={styles.headerActions}>
        {pendingItems.length ? <Pressable style={styles.headerButton} onPress={() => openFeedback()} accessibilityRole="button">
          <Text style={styles.headerButtonText}>Rate {pendingItems.length}</Text>
        </Pressable> : null}
        <Pressable style={styles.headerButton} onPress={() => setMenuOpen(true)} accessibilityRole="button" accessibilityLabel="Open account and history">
          <Text style={styles.headerButtonText}>Menu</Text>
        </Pressable>
      </View>
    </View>

    <ScrollView ref={scrollRef} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Section title="Plan">
        <View style={styles.locationRow}>
          <View style={styles.flex}>
            <Text style={styles.locationName} numberOfLines={1}>{forecast ? recommendationInput?.current.locationLabel : "Choose location"}</Text>
            <Text style={styles.note} numberOfLines={2}>{weatherStatus}</Text>
          </View>
          {busy ? <ActivityIndicator color="#173d2a" /> : <Action label={locationSearchOpen ? "Close" : "Change"} small onPress={() => setLocationSearchOpen((current) => !current)} />}
        </View>
        {locationSearchOpen ? <View style={styles.searchPanel}>
          <View style={styles.row}>
            <TextInput style={[styles.input, styles.flex]} value={locationQuery} onChangeText={setLocationQuery} placeholder="Search city" returnKeyType="search" onSubmitEditing={findLocations} />
            <Action label="Search" onPress={findLocations} />
          </View>
          {locations.map((location) => <Pressable key={location.id} style={styles.listButton} onPress={() => chooseLocation(location)}>
            <Text>{formatLocationLabel(location)}</Text>
          </Pressable>)}
        </View> : null}

        <Text style={styles.label}>Activity</Text>
        <Segment equal values={["running", "walking", "commute"]} selected={form.mode} label={(value) => value === "running" ? "Run" : value === "walking" ? "Walk" : "Commute"} onSelect={(value) => updateForm("mode", value as ActivityMode)} />

        <RequiredLabel>How you feel the cold</RequiredLabel>
        <Segment compact equal values={["standard", "always-cold", "heat-sensitive"]} selected={selectedStarterProfile} label={(value) => starterProfiles[value as StarterProfile].label} onSelect={(value) => {
          const profile = value as StarterProfile;
          setSelectedStarterProfile(profile);
          updateForm("starterProfile", profile);
        }} />

        {form.mode === "running" ? <>
          <RequiredLabel>Intensity</RequiredLabel>
          <Segment equal values={["easy", "medium", "hard"]} selected={selectedRunningIntensity} onSelect={(value) => {
            const intensity = value as RunningIntensity;
            setSelectedRunningIntensity(intensity);
            updateForm("intensity", intensity);
          }} />
        </> : null}

        {form.mode === "commute" ? <>
          <RequiredLabel>Commute mode</RequiredLabel>
          <Segment compact equal values={["walking", "transit", "bicycle", "car"]} selected={selectedCommuteMode} onSelect={(value) => {
            const commuteMode = value as CommuteMode;
            setSelectedCommuteMode(commuteMode);
            updateForm("commuteMode", commuteMode);
          }} />
          <View style={styles.commuteRow}>
            <View style={styles.flex}>
              <RequiredLabel>Outdoor minutes</RequiredLabel>
              <TextInput style={styles.input} keyboardType="number-pad" value={outdoorMinutesInput} placeholder="20" onChangeText={(value) => {
                const digits = value.replace(/\D/g, "");
                setOutdoorMinutesInput(digits);
                if (digits) updateForm("outdoorMinutes", Math.max(0, Number(digits)));
              }} />
            </View>
            <View style={styles.carryControl}>
              <RequiredLabel>Carry extra layer</RequiredLabel>
              <Segment compact equal values={["yes", "no"]} selected={canCarryLayerChoice === null ? null : canCarryLayerChoice ? "yes" : "no"} onSelect={(value) => {
                const canCarry = value === "yes";
                setCanCarryLayerChoice(canCarry);
                updateForm("canCarryLayer", canCarry);
              }} />
            </View>
          </View>
        </> : null}

        <View style={styles.twoColumns}>
          <TimeField label="Start" value={formatClockTime(form.startTime)} onPress={() => openTimePicker("start")} />
          <TimeField label="Return" value={formatClockTime(form.returnHomeTime)} onPress={() => openTimePicker("return")} />
        </View>
        <Text style={styles.label}>Duration</Text>
        <Segment compact equal values={[30, 45, 60, 90]} selected={form.durationMinutes} label={(value) => `${value} min`} onSelect={(value) => {
          setForm((current) => updatePlannerDuration(current, Number(value)));
        }} />
      </Section>

      <View onLayout={(event) => { recommendationY.current = event.nativeEvent.layout.y; }}>
        <Section title="Recommendation">
          {recommendation && recommendationInput && result ? <>
            <Text style={styles.headline}>{recommendation.headline}</Text>
            <Text style={styles.note}>{recommendationInput.current.locationLabel} · {recommendation.confidenceScore}% confidence</Text>
            <View style={styles.weatherRow}>
              <Metric label="Start" value={`${recommendationInput.current.feelsLikeC} C`} />
              <Metric label="Wind" value={`${recommendationInput.current.windKph} km/h`} />
              <Metric label="Return" value={`${recommendationInput.forecastAtReturn.feelsLikeC} C`} />
            </View>
            <Segment equal compact values={result.variants.map((variant) => variant.id)} selected={result.selectedVariantId} label={(id) => result.variants.find((variant) => variant.id === id)?.kind ?? id} onSelect={(id) => chooseVariant(String(id))} />
            {recommendation.running ? <>
              <Outfit title="Warm-up" items={recommendation.running.warmUp} />
              <Outfit title="Main run" items={recommendation.running.mainRun} />
              <Outfit title="Post-run" items={recommendation.running.postRun} />
            </> : <Outfit title="Selected outfit" items={selectedVariant?.outfit ?? recommendation.outfit} />}
            {selectedVariant?.requiredItems.length ? <View style={styles.feedbackBox}>
              <Text style={styles.warning}>Safety required: {selectedVariant.requiredItems.map((item) => labels[item]).join(", ")}.</Text>
              <View style={styles.chips}>{selectedVariant.requiredItems.map((item) => <Action key={item} small label={rejectedRequiredItems.includes(item) ? `Warning active: ${labels[item]}` : `I won't wear ${labels[item]}`} onPress={() => setRejectedRequiredItems((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])} />)}</View>
              {rejectedRequiredItems.length ? <Text style={styles.warning}>The rejected item remains recommended and its safety warning stays active.</Text> : null}
            </View> : null}
            {recommendation.riskWarnings.map((warning) => <Text key={warning.type} style={styles.warning}>{warning.severity.toUpperCase()}: {warning.message}</Text>)}
            <Action label="I’ll wear this" onPress={acceptOutfit} primary />
            <Text style={styles.note}>{recommendationStatus}</Text>
            <Pressable style={styles.disclosure} onPress={toggleExplanation} accessibilityRole="button">
              <Text style={styles.disclosureText}>Why this outfit?</Text>
              <Text style={styles.disclosureIcon}>{explanationOpen ? "−" : "+"}</Text>
            </Pressable>
            {explanationOpen ? <View style={styles.explanationPanel}>
              <View style={styles.chips}>{shortcutQuestions[form.mode].map((shortcut) => <Action key={shortcut.intent} label={shortcut.label} onPress={() => ask(shortcut.intent)} small />)}</View>
              <Text style={styles.explanation}>{explanation || explanationStatus}</Text>
              <View style={styles.row}>
                <TextInput style={[styles.input, styles.flex]} value={question} onChangeText={setQuestion} maxLength={300} placeholder="Ask another question" />
                <Action label="Ask" onPress={() => ask()} disabled={question.trim().length < 3} />
              </View>
            </View> : null}
            <Text style={styles.meta}>{result.engineVersion} · {result.source} · safety {result.safetyPolicyVersion}</Text>
          </> : <View style={styles.emptyState}>
            {busy ? <ActivityIndicator color="#173d2a" /> : null}
            <Text style={styles.note}>{missingPlanFields.length ? `Complete the plan: ${missingPlanFields.join(", ")}.` : "Preparing your recommendation..."}</Text>
          </View>}
        </Section>
      </View>
    </ScrollView>

    <Modal visible={timePickerTarget !== null} transparent animationType="fade" onRequestClose={() => setTimePickerTarget(null)}>
      <View style={styles.modalLayer}>
        <Pressable style={styles.modalBackdrop} onPress={() => setTimePickerTarget(null)} accessibilityLabel="Close time picker" />
        <View style={styles.timeSheet}>
          <View style={styles.sheetHeader}>
            <Pressable style={styles.sheetSide} onPress={() => setTimePickerTarget(null)}><Text style={styles.sheetAction}>Cancel</Text></Pressable>
            <Text style={styles.sheetTitle}>{timePickerTarget === "start" ? "Start time" : "Return time"}</Text>
            <Pressable style={[styles.sheetSide, styles.sheetSideRight]} onPress={applyTimePicker}><Text style={styles.sheetActionStrong}>Done</Text></Pressable>
          </View>
          <View style={styles.pickerCenter}>
            <DateTimePicker value={timePickerValue} mode="time" display="spinner" locale="en_GB" minuteInterval={5} onChange={(_event, nextDate) => { if (nextDate) setTimePickerValue(nextDate); }} style={styles.timePicker} />
          </View>
        </View>
      </View>
    </Modal>

    <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
      <View style={styles.drawerLayer}>
        <Pressable style={styles.drawerBackdrop} onPress={() => setMenuOpen(false)} accessibilityLabel="Close menu" />
        <SafeAreaView style={styles.drawer}>
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>Account</Text>
            <Pressable onPress={() => setMenuOpen(false)} accessibilityRole="button"><Text style={styles.sheetActionStrong}>Done</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.drawerContent} keyboardShouldPersistTaps="handled">
            {user ? <>
              <Text style={styles.accountEmail}>{user.email}</Text>
              <View style={styles.chips}>
                <Action label="Sign out" onPress={signOut} />
                <Action label="Reset comfort memory" onPress={resetMemory} />
              </View>
            </> : <>
              <TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="Email" />
              <Action label="Send sign-in link" onPress={sendMagicLink} primary disabled={!email.trim() || !isSupabaseConfigured()} />
            </>}
            <Text style={styles.note}>{authStatus}</Text>
            {!user ? <Text style={styles.note}>Guest pending feedback remains on this device and is excluded from SWAOP training.</Text> : null}
            <View style={styles.divider} />
            <Text style={styles.drawerTitle}>History</Text>
            {history.length ? history.map((item) => <View key={item.id} style={styles.history}>
              <Text style={styles.listTitle}>{item.locationLabel}</Text>
              <Text style={styles.note}>{item.activityMode} · {item.headline}</Text>
              {item.feedbackDueAt ? <Text style={styles.note}>Feedback due {formatDate(item.feedbackDueAt)}</Text> : null}
            </View>) : <Text style={styles.note}>{user ? "No recommendations yet." : "Sign in to see synced history."}</Text>}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>

    <Modal visible={feedbackOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFeedbackOpen(false)}>
      <SafeAreaView style={styles.feedbackModal}>
        <View style={styles.drawerHeader}>
          <Text style={styles.drawerTitle}>Rate your outfit</Text>
          <Pressable onPress={() => setFeedbackOpen(false)} accessibilityRole="button"><Text style={styles.sheetActionStrong}>Done</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.feedbackContent}>
          {pendingItems.length ? pendingItems.map((item) => <Pressable key={item.id} style={[styles.listButton, activePendingId === item.id && styles.listButtonActive]} onPress={() => openFeedback(item)}>
            <Text style={styles.listTitle}>{item.locationLabel}</Text>
            <Text style={styles.note}>Due {formatDate(item.dueAt)}</Text>
          </Pressable>) : <Text style={styles.note}>No post-activity feedback is pending.</Text>}
          {activePending ? <View style={styles.feedbackBox}>
            {!activeFeedbackDue ? <Text style={styles.note}>Feedback opens after your return: {formatDate(activePending.dueAt)}.</Text> : <>
              <Text style={styles.label}>How did the outfit feel?</Text>
              <Segment equal values={["too_cold", "good", "too_warm"]} selected={feedbackRating} onSelect={(value) => setFeedbackRating(value as FeedbackRating)} />
              <Text style={styles.label}>Did you wear the recommended outfit?</Text>
              <Segment equal compact values={["yes", "with_changes", "no"]} selected={actuallyWorn} onSelect={(value) => setActuallyWorn(value as ActuallyWorn)} />
              {needsContext && feedbackRating && actuallyWorn ? <>
                <Text style={styles.label}>What changed?</Text>
                <Segment values={["none", "added_layer", "removed_layer", "changed_top", "changed_bottom"]} selected={adjustment} onSelect={(value) => setAdjustment(value as FeedbackAdjustment)} />
                <Text style={styles.label}>Problem area</Text>
                <Segment values={["upper", "lower", "hands_head", "start", "during", "return"]} selected={problemArea} onSelect={(value) => setProblemArea(value as FeedbackProblemArea)} />
              </> : null}
              <Action label="Save feedback" onPress={submitFeedback} primary disabled={!feedbackRating || !actuallyWorn} />
            </>}
          </View> : null}
          <Text style={styles.note}>{feedbackStatus}</Text>
          <Text style={styles.note}>Context offset: {recommendationInput ? getContextTemperatureOffset(recommendationInput.activity, comfortMemory, temperatureOffsetC) : 0} C · Good rate: {feedbackStats.total ? `${feedbackStats.goodRate}%` : "new"}</Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

function RequiredLabel({ children }: { children: React.ReactNode }) {
  return <View style={styles.requiredLabelRow}><Text style={styles.label}>{children}</Text><Text style={styles.requiredText}>Required</Text></View>;
}

function Action({ label, onPress, primary, small, disabled }: { label: string; onPress: () => void; primary?: boolean; small?: boolean; disabled?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.action, primary && styles.actionPrimary, small && styles.actionSmall, (pressed || disabled) && styles.actionMuted]} accessibilityRole="button">
    <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{label}</Text>
  </Pressable>;
}

function Segment<T extends string | number>({ values, selected, onSelect, label = String, equal, compact }: { values: T[]; selected: T | null; onSelect: (value: T) => void; label?: (value: T) => string; equal?: boolean; compact?: boolean }) {
  return <View style={[styles.chips, equal && styles.segmentRow]}>{values.map((value) => <Pressable key={String(value)} onPress={() => onSelect(value)} style={[styles.chip, equal && styles.chipEqual, compact && styles.chipCompact, selected === value && styles.chipActive]} accessibilityRole="button">
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78} style={[styles.chipText, compact && styles.chipTextCompact, selected === value && styles.chipTextActive]}>{label(value).replaceAll("_", " ")}</Text>
  </Pressable>)}</View>;
}

function TimeField({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return <View style={styles.flex}>
    <Text style={styles.label}>{label}</Text>
    <Pressable style={styles.timeField} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label} time, ${value}`}>
      <Text style={styles.timeValue}>{value}</Text>
      <Text style={styles.timeChevron}>⌄</Text>
    </Pressable>
  </View>;
}

function Outfit({ title, items }: { title: string; items: ClothingItem[] }) {
  return <View style={styles.outfit}><Text style={styles.label}>{title}</Text><Text style={styles.outfitText}>{items.map((item) => labels[item]).join(", ")}</Text></View>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.note}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

function toPendingItem(item: LocalPendingFeedback): PendingItem {
  return {
    id: item.clientRequestId,
    clientRequestId: item.clientRequestId,
    recommendationId: item.recommendationId,
    selectedVariantId: item.selectedVariantId,
    dueAt: item.dueAt,
    activity: item.input.activity,
    locationLabel: item.input.current.locationLabel,
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function locationId(latitude: number, longitude: number) {
  return Math.round((latitude + 90) * 1_000_000 + (longitude + 180) * 1_000);
}

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f3ee" },
  topBar: { minHeight: 76, paddingHorizontal: 18, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#dedfd8", backgroundColor: "#f4f3ee" },
  headerActions: { flexDirection: "row", gap: 7, alignItems: "center" },
  headerButton: { minHeight: 38, justifyContent: "center", borderWidth: 1, borderColor: "#b8c0ba", borderRadius: 10, paddingHorizontal: 11, backgroundColor: "#fafaf7" },
  headerButtonText: { color: "#173d2a", fontWeight: "700", fontSize: 13 },
  page: { padding: 14, paddingBottom: 56, gap: 14 },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.6, color: "#557063" },
  title: { fontSize: 21, lineHeight: 26, fontWeight: "800", color: "#17231c" },
  section: { backgroundColor: "#ffffff", borderRadius: 16, padding: 15, gap: 10, borderWidth: 1, borderColor: "#dedfd8" },
  sectionTitle: { fontSize: 20, lineHeight: 24, fontWeight: "800", color: "#17231c" },
  headline: { fontSize: 24, lineHeight: 29, fontWeight: "800", color: "#17231c" },
  label: { fontSize: 12, fontWeight: "700", color: "#415046", marginTop: 2 },
  note: { fontSize: 12, lineHeight: 17, color: "#68736c" },
  meta: { fontSize: 10, color: "#7a847d" },
  input: { minHeight: 44, borderWidth: 1, borderColor: "#cfd4cf", borderRadius: 10, paddingHorizontal: 11, backgroundColor: "#fbfcfa", color: "#17231c" },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  twoColumns: { flexDirection: "row", gap: 10 },
  flex: { flex: 1 },
  locationRow: { minHeight: 48, flexDirection: "row", gap: 10, alignItems: "center", paddingBottom: 2 },
  locationName: { fontSize: 15, lineHeight: 20, fontWeight: "700", color: "#17231c" },
  searchPanel: { gap: 8, paddingBottom: 2 },
  commuteRow: { flexDirection: "row", gap: 12, alignItems: "flex-end" },
  carryControl: { flex: 1.25, gap: 5 },
  requiredLabelRow: { minHeight: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  requiredText: { fontSize: 10, fontWeight: "700", color: "#8a5b17" },
  action: { minHeight: 42, justifyContent: "center", alignItems: "center", borderRadius: 10, borderWidth: 1, borderColor: "#96a49a", paddingHorizontal: 13, paddingVertical: 8 },
  actionPrimary: { backgroundColor: "#173d2a", borderColor: "#173d2a" },
  actionSmall: { minHeight: 34, paddingVertical: 5, paddingHorizontal: 9 },
  actionMuted: { opacity: 0.5 },
  actionText: { fontWeight: "700", fontSize: 13, color: "#173d2a", textAlign: "center" },
  actionTextPrimary: { color: "#ffffff" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  segmentRow: { flexWrap: "nowrap", width: "100%" },
  chip: { minHeight: 38, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#c9d0ca", borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8 },
  chipEqual: { flex: 1, paddingHorizontal: 5 },
  chipCompact: { minHeight: 36, paddingVertical: 7 },
  chipActive: { backgroundColor: "#dce9df", borderColor: "#48735a" },
  chipText: { color: "#536058", textTransform: "capitalize", textAlign: "center", fontSize: 13 },
  chipTextCompact: { fontSize: 11.5 },
  chipTextActive: { color: "#173d2a", fontWeight: "800" },
  timeField: { minHeight: 50, borderWidth: 1, borderColor: "#cfd4cf", borderRadius: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fbfcfa" },
  timeValue: { fontSize: 20, fontWeight: "800", color: "#17231c", fontVariant: ["tabular-nums"] },
  timeChevron: { fontSize: 18, color: "#68736c", marginTop: -5 },
  listButton: { borderWidth: 1, borderColor: "#d9ddd9", borderRadius: 10, padding: 11, gap: 3, backgroundColor: "#ffffff" },
  listButtonActive: { borderColor: "#48735a", backgroundColor: "#eef5ef" },
  listTitle: { fontWeight: "700", color: "#17231c" },
  weatherRow: { flexDirection: "row", gap: 7 },
  metric: { flex: 1, backgroundColor: "#f4f6f2", borderRadius: 10, padding: 9 },
  metricValue: { fontSize: 15, fontWeight: "800", marginTop: 2, color: "#17231c" },
  outfit: { padding: 11, backgroundColor: "#f7f8f5", borderRadius: 10, gap: 3 },
  outfitText: { color: "#25342c", lineHeight: 19 },
  warning: { padding: 9, borderRadius: 9, backgroundColor: "#fff3d8", color: "#674c13", lineHeight: 18 },
  feedbackBox: { gap: 10, paddingTop: 4 },
  disclosure: { minHeight: 44, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: "#e1e4df", marginTop: 2, paddingTop: 8 },
  disclosureText: { fontSize: 15, fontWeight: "700", color: "#173d2a" },
  disclosureIcon: { fontSize: 22, color: "#173d2a" },
  explanationPanel: { gap: 10 },
  explanation: { lineHeight: 20, color: "#34423a" },
  emptyState: { minHeight: 76, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 24 },
  divider: { height: 1, backgroundColor: "#e1e4df", marginVertical: 4 },
  modalLayer: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(17, 29, 22, 0.35)" },
  timeSheet: { backgroundColor: "#ffffff", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 24 },
  sheetHeader: { minHeight: 54, paddingHorizontal: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#e1e4df" },
  sheetTitle: { flex: 1, fontSize: 16, fontWeight: "800", color: "#17231c", textAlign: "center" },
  sheetSide: { width: 64, alignItems: "flex-start" },
  sheetSideRight: { alignItems: "flex-end" },
  sheetAction: { fontSize: 16, color: "#68736c" },
  sheetActionStrong: { fontSize: 16, fontWeight: "700", color: "#17613a" },
  pickerCenter: { alignItems: "center", justifyContent: "center" },
  timePicker: { width: 300, height: 190 },
  drawerLayer: { flex: 1, flexDirection: "row", justifyContent: "flex-end" },
  drawerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(17, 29, 22, 0.35)" },
  drawer: { width: "86%", maxWidth: 390, backgroundColor: "#f8f8f5", borderLeftWidth: 1, borderLeftColor: "#d7dbd7" },
  drawerHeader: { minHeight: 58, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#dedfd8" },
  drawerTitle: { fontSize: 20, fontWeight: "800", color: "#17231c" },
  drawerContent: { padding: 16, gap: 12 },
  accountEmail: { fontSize: 16, fontWeight: "700", color: "#17231c" },
  history: { borderTopWidth: 1, borderTopColor: "#e1e4df", paddingTop: 10, gap: 3 },
  feedbackModal: { flex: 1, backgroundColor: "#f4f3ee" },
  feedbackContent: { padding: 16, paddingBottom: 40, gap: 11 },
});
