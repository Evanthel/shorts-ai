import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  type StyleProp,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import type { User } from "@supabase/supabase-js";
import {
  buildComfortSummary,
  buildRecommendationInput,
  createFallbackExplanation,
  createInitialPlannerForm,
  createOutOfScopeExplanation,
  createRecommendation,
  emptyFeedbackStats,
  fetchLocationForecast,
  formatClockTime,
  formatLocationLabel,
  getFeedbackChangeNote,
  getFeedbackTemperatureDelta,
  getProfileLearningCopy,
  getRecommendationQualitySummary,
  isFollowUpInScope,
  projectFeedbackStats,
  searchLocations,
  starterProfiles,
  updatePlannerReturnClockTime,
  updatePlannerStartClockTime,
  updatePlannerDuration,
} from "@shorts-ai/core";
import type {
  ActivityMode,
  ClothingItem,
  FeedbackRating,
  FeedbackStats,
  GeoLocation,
  LocationForecast,
  PlannerForm,
  RunningIntensity,
  StarterProfile,
} from "@shorts-ai/core";
import { requestMobileExplanation } from "./src/services/explanation";
import {
  deleteFavouriteLocation,
  loadFavouriteLocations,
  loadFeedbackStats,
  loadProfileMemory,
  loadRecommendationHistory,
  resetProfileMemory,
  saveFavouriteLocation,
  saveFeedback,
  saveProfileMemory,
  saveRecommendation,
} from "./src/services/persistence";
import type {
  FavouriteLocation,
  RecommendationHistoryItem,
} from "./src/services/persistence";
import {
  createMobileSupabaseClient,
  exchangeAuthUrl,
  getAuthRedirectUrl,
  isSupabaseConfigured,
} from "./src/lib/supabase";

type ActivePanel = "planner" | "recommendation" | "ai" | "personalization" | "profile";
type TimePickerTarget = "start" | "return";

const WHEEL_ITEM_HEIGHT = 44;
const WHEEL_VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ITEMS;
const MINUTE_STEP = 5;
const HOUR_OPTIONS = Array.from({ length: 24 }, (_item, index) => index);
const MINUTE_OPTIONS = Array.from(
  { length: 60 / MINUTE_STEP },
  (_item, index) => index * MINUTE_STEP,
);
const FALLBACK_LOCATION_QUERY = "Warsaw";

function normalizePickerMinute(value: number) {
  const rounded = Math.round(value / MINUTE_STEP) * MINUTE_STEP;

  return Math.min(55, Math.max(0, rounded));
}

function createDeviceLocationName(address: Location.LocationGeocodedAddress | undefined) {
  if (!address) {
    return "Current location";
  }

  return address.city ?? address.district ?? address.subregion ?? "Current location";
}

function createDeviceLocation(
  address: Location.LocationGeocodedAddress | undefined,
  coords: Location.LocationObjectCoords,
): GeoLocation {
  return {
    id: -1,
    name: createDeviceLocationName(address),
    admin1: address?.region ?? undefined,
    country: address?.country ?? "",
    latitude: coords.latitude,
    longitude: coords.longitude,
    timezone: "auto",
  };
}

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

export default function App() {
  const [activePanel, setActivePanel] = useState<ActivePanel>("planner");
  const [form, setForm] = useState<PlannerForm>(() => createInitialPlannerForm());
  const [timePickerTarget, setTimePickerTarget] = useState<TimePickerTarget | null>(null);
  const [timePickerHour, setTimePickerHour] = useState(0);
  const [timePickerMinute, setTimePickerMinute] = useState(0);
  const [locationQuery, setLocationQuery] = useState(FALLBACK_LOCATION_QUERY);
  const [locationResults, setLocationResults] = useState<GeoLocation[]>([]);
  const [forecast, setForecast] = useState<LocationForecast | null>(null);
  const [weatherStatus, setWeatherStatus] = useState("Finding your location...");
  const [busy, setBusy] = useState(false);
  const [ratedRecommendations, setRatedRecommendations] = useState(3);
  const [temperatureOffsetC, setTemperatureOffsetC] = useState(0);
  const [feedbackStats, setFeedbackStats] = useState<FeedbackStats>(() => emptyFeedbackStats());
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [authStatus, setAuthStatus] = useState(
    isSupabaseConfigured()
      ? "Sign in to save feedback and history."
      : "Supabase is not configured.",
  );
  const [saveStatus, setSaveStatus] = useState("Sign in to save your profile.");
  const [profileStatus, setProfileStatus] = useState("Using starter profile.");
  const [profileChangeNote, setProfileChangeNote] = useState(
    "Rate the recommendation to teach the profile how warm or light you prefer the outfit.",
  );
  const [lastRecommendationId, setLastRecommendationId] = useState<string | null>(null);
  const [favouriteStatus, setFavouriteStatus] = useState("");
  const [favouriteLocations, setFavouriteLocations] = useState<FavouriteLocation[]>([]);
  const [defaultFavouriteId, setDefaultFavouriteId] = useState<string | null>(null);
  const [recommendationHistory, setRecommendationHistory] = useState<RecommendationHistoryItem[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [explanation, setExplanation] = useState("");
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [explanationStatus, setExplanationStatus] = useState(
    "Generate an explanation after the recommendation is ready.",
  );
  const [explanationTone, setExplanationTone] = useState<"neutral" | "success" | "warning">("neutral");

  const recommendationInput = useMemo(
    () =>
      forecast
        ? buildRecommendationInput(form, forecast, ratedRecommendations, temperatureOffsetC)
        : null,
    [forecast, form, ratedRecommendations, temperatureOffsetC],
  );
  const recommendation = useMemo(
    () => (recommendationInput ? createRecommendation(recommendationInput) : null),
    [recommendationInput],
  );
  const running = recommendation?.running;
  const readiness = Math.min(100, Math.round((ratedRecommendations / 15) * 100));
  const isPersonalized = readiness >= 100;
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
  const isOutfitNavActive =
    activePanel === "recommendation" ||
    activePanel === "ai" ||
    activePanel === "personalization";
  const runningReminders = running
    ? [
        running.carryExtraLayer ? "Extra layer" : null,
        running.hydrationReminder ? "Hydration" : null,
        running.visibilityReminder ? "Visibility" : null,
      ].filter((reminder): reminder is string => Boolean(reminder))
    : [];
  const plannerMeta = locationResults.length > 0
    ? weatherStatus
    : weatherStatus.startsWith("Using live forecast")
    ? undefined
    : weatherStatus;

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }

    const supabase = createMobileSupabaseClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthStatus(
        data.user
          ? "Signed in. Feedback will update your profile."
          : "Sign in to save feedback and history.",
      );
    });

    const handleUrl = ({ url }: { url: string }) => {
      exchangeAuthUrl(url)
        .then(() => setAuthStatus("Signed in. Feedback will update your profile."))
        .catch(() => setAuthStatus("Could not complete sign in."));
    };

    Linking.getInitialURL().then((url) => {
      if (url) {
        handleUrl({ url });
      }
    });

    const urlSubscription = Linking.addEventListener("url", handleUrl);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      setAuthStatus(
        nextUser
          ? "Signed in. Feedback will update your profile."
          : "Sign in to save feedback and history.",
      );
    });

    return () => {
      urlSubscription.remove();
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadInitialForecast() {
      try {
        const deviceLocation = await getDeviceLocation();

        if (ignore) {
          return;
        }

        if (deviceLocation) {
          setLocationQuery(formatLocationLabel(deviceLocation));
          await selectLocation(deviceLocation, ignore);
          return;
        }
      } catch {
        if (!ignore) {
          setWeatherStatus("Could not use device location.");
        }
      }

      await loadFallbackForecast(ignore);
    }

    void loadInitialForecast();

    return () => {
      ignore = true;
    };
  }, []);

  async function getDeviceLocation() {
    setWeatherStatus("Finding your location...");
    const permission = await Location.requestForegroundPermissionsAsync();

    if (permission.status !== Location.PermissionStatus.GRANTED) {
      setWeatherStatus("Location permission denied. Loading fallback forecast...");
      return null;
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    let address: Location.LocationGeocodedAddress | undefined;

    try {
      [address] = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    } catch {
      address = undefined;
    }

    return createDeviceLocation(address, position.coords);
  }

  async function loadFallbackForecast(ignore: boolean) {
    if (ignore) {
      return;
    }

    try {
      setWeatherStatus(`Loading ${FALLBACK_LOCATION_QUERY} forecast...`);
      const results = await searchLocations(FALLBACK_LOCATION_QUERY);

      if (ignore) {
        return;
      }

      if (results[0]) {
        setLocationQuery(formatLocationLabel(results[0]));
        await selectLocation(results[0], ignore);
      }
    } catch {
      if (!ignore) {
        setWeatherStatus("Could not load the fallback forecast.");
      }
    }
  }

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
        setSaveStatus("Save recommendations to keep history.");
        const storedDefaultId = await getStoredDefaultFavouriteId(user.id);
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

  function updateForm<Key extends keyof PlannerForm>(key: Key, value: PlannerForm[Key]) {
    resetExplanation();
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetExplanation() {
    setExplanation("");
    setExplanationTone("neutral");
    setExplanationStatus("Generate an explanation after the recommendation is ready.");
  }

  async function runSearch() {
    if (locationQuery.trim().length < 2) {
      setLocationResults([]);
      setWeatherStatus("Type at least two characters to search.");
      return;
    }

    setBusy(true);
    setWeatherStatus("Searching locations...");

    try {
      const results = await searchLocations(locationQuery);
      setLocationResults(results);
      setWeatherStatus(results.length > 0 ? "Choose a matching location." : "No locations found.");
    } catch {
      setWeatherStatus("Location search failed.");
    } finally {
      setBusy(false);
    }
  }

  async function chooseLocation(location: GeoLocation) {
    resetExplanation();
    await selectLocation(location, false);
    setLocationQuery(formatLocationLabel(location));
    setLocationResults([]);
    setActivePanel("recommendation");
  }

  async function selectLocation(location: GeoLocation, ignore: boolean) {
    setBusy(true);
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
    } finally {
      if (!ignore) {
        setBusy(false);
      }
    }
  }

  async function sendMagicLink() {
    if (!isSupabaseConfigured()) {
      setAuthStatus("Supabase is not configured.");
      return;
    }

    if (!email.trim()) {
      setAuthStatus("Enter an email address first.");
      return;
    }

    const supabase = createMobileSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: getAuthRedirectUrl(),
      },
    });

    setAuthStatus(error ? error.message : "Magic link sent. Open it on this iPhone.");
  }

  async function signOut() {
    if (!isSupabaseConfigured()) {
      return;
    }

    await createMobileSupabaseClient().auth.signOut();
  }

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

  async function applyFeedback(feedback: FeedbackRating) {
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
      setAuthStatus("Sign in to save favourite locations.");
      setActivePanel("profile");
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
        await clearStoredDefaultFavouriteId(user.id);
        setDefaultFavouriteId(null);
      }

      setFavouriteLocations(await loadFavouriteLocations(user));
      setFavouriteStatus("Location removed.");
    } catch {
      setFavouriteStatus("Could not remove location.");
    }
  }

  async function setDefaultFavourite(location: FavouriteLocation) {
    if (!user) {
      return;
    }

    await setStoredDefaultFavouriteId(user.id, location.favouriteId);
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
      const result = await requestMobileExplanation({
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
      setExplanation(createFallbackExplanation({
        input: recommendationInput,
        recommendation,
        question,
      }));
      setExplanationTone("warning");
      setExplanationStatus("AI request failed. Using deterministic fallback explanation.");
    }
  }

  function openTimePicker(target: TimePickerTarget) {
    const value = target === "start" ? form.startTime : form.returnHomeTime;
    const date = new Date(value);
    const fallback = new Date();
    const source = Number.isFinite(date.getTime()) ? date : fallback;

    setTimePickerTarget(target);
    setTimePickerHour(source.getHours());
    setTimePickerMinute(normalizePickerMinute(source.getMinutes()));
  }

  function applyTimePicker() {
    if (!timePickerTarget) {
      return;
    }

    const clockTime = `${String(timePickerHour).padStart(2, "0")}:${String(normalizePickerMinute(timePickerMinute)).padStart(2, "0")}`;

    setForm((current) =>
      timePickerTarget === "start"
        ? updatePlannerStartClockTime(current, clockTime)
        : updatePlannerReturnClockTime(current, clockTime),
    );
    resetExplanation();
    setTimePickerTarget(null);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
        <ScrollView
        style={styles.page}
        contentContainerStyle={styles.content}
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <Text style={styles.brandSmall}>ShortsAI</Text>
          <Pressable
            onPress={() =>
              setActivePanel(
                activePanel === "profile"
                  ? recommendation
                    ? "recommendation"
                    : "planner"
                  : "profile",
              )
            }
            style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}
          >
            <Text style={styles.profileButtonText}>
              {activePanel === "profile" ? "Done" : user ? "Profile" : "Sign in"}
            </Text>
          </Pressable>
        </View>

        {activePanel === "planner" ? (
        <Section title="Location" meta={plannerMeta}>
          <View style={styles.searchRow}>
            <TextInput
              value={locationQuery}
              onChangeText={(value) => {
                setLocationQuery(value);

                if (value.trim().length === 0) {
                  setLocationResults([]);
                }
              }}
              placeholder="Search city"
              placeholderTextColor="#7c8178"
              style={[styles.input, styles.searchInput]}
              returnKeyType="search"
              onSubmitEditing={runSearch}
            />
            <ActionButton label="Search" onPress={runSearch} disabled={busy} compact />
          </View>

          {busy ? <ActivityIndicator color="#1f5f47" /> : null}

          {locationResults.length > 0 ? (
            <View style={styles.optionList}>
              {locationResults.map((location) => (
                <Pressable
                  key={location.id}
                  onPress={() => void chooseLocation(location)}
                  style={({ pressed }) => [styles.optionButton, pressed && styles.pressed]}
                >
                  <Text style={styles.optionText}>{formatLocationLabel(location)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.controlBlock}>
            <Text style={styles.label}>Activity</Text>
            <SegmentedControl
              options={[
                ["running", "Run"],
                ["walking", "Walk / commute"],
              ]}
              value={form.mode}
              onChange={(value) => updateForm("mode", value as ActivityMode)}
            />
          </View>

          {!isPersonalized ? (
            <View style={styles.controlBlock}>
              <Text style={styles.label}>Your temp feeling</Text>
              <SegmentedControl
                options={Object.values(starterProfiles).map((profile) => [profile.id, profile.label])}
                value={form.starterProfile}
                onChange={(value) => updateForm("starterProfile", value as StarterProfile)}
              />
            </View>
          ) : null}

          {form.mode === "running" ? (
            <View style={styles.controlBlock}>
              <Text style={styles.label}>Intensity</Text>
              <SegmentedControl
                options={[
                  ["easy", "Easy"],
                  ["medium", "Medium"],
                  ["hard", "Hard"],
                ]}
                value={form.intensity}
                onChange={(value) => updateForm("intensity", value as RunningIntensity)}
              />
            </View>
          ) : null}

          <View style={styles.timeRow}>
            <TimeSelectButton
              label="Start"
              value={formatClockTime(form.startTime)}
              onPress={() => openTimePicker("start")}
            />
            <TimeSelectButton
              label="Return"
              value={formatClockTime(form.returnHomeTime)}
              onPress={() => openTimePicker("return")}
            />
          </View>

          <View style={styles.durationRow}>
            <View style={styles.durationValue}>
              <Text style={styles.label}>Duration</Text>
              <Text style={styles.durationText}>{form.durationMinutes} min</Text>
            </View>
            <View style={styles.stepper}>
              <ActionButton
                label="-5"
                onPress={() => {
                  setForm((current) => updatePlannerDuration(current, Math.max(15, current.durationMinutes - 5)));
                  resetExplanation();
                }}
                compact
              />
              <ActionButton
                label="+5"
                onPress={() => {
                  setForm((current) => updatePlannerDuration(current, Math.min(120, current.durationMinutes + 5)));
                  resetExplanation();
                }}
                compact
              />
            </View>
          </View>

          <ActionButton
            label={recommendation ? "Show recommendation" : "Choose a location"}
            onPress={() => setActivePanel("recommendation")}
            disabled={!recommendation}
          />
        </Section>
        ) : null}

        {activePanel === "recommendation" ? (
        <Section
          title={recommendation?.headline ?? "Recommendation"}
          meta={!recommendationInput ? "Choose a location first." : undefined}
          prominent
        >
          {recommendation && recommendationInput ? (
            <>
              <View style={styles.weatherStrip}>
                <Metric label="Start" value={`${recommendationInput.current.feelsLikeC} C`} />
                <Metric label="Return" value={`${recommendationInput.forecastAtReturn.feelsLikeC} C`} />
                <Metric label="Wind" value={`${recommendationInput.current.windKph} km/h`} />
              </View>

              {running ? (
                <View style={styles.phaseStack}>
                  <OutfitPhase title="Warm-up" items={running.warmUp} />
                  <OutfitPhase title="Main run" items={running.mainRun} />
                  <OutfitPhase title="Post-run" items={running.postRun} />
                </View>
              ) : (
                <OutfitPhase title="Recommended outfit" items={recommendation.outfit} />
              )}

              {runningReminders.length > 0 ? (
                <View style={styles.reminderBlock}>
                  <Text style={styles.reminderText}>
                    <Text style={styles.reminderLabel}>Remember about: </Text>
                    {runningReminders.join(", ")}
                  </Text>
                </View>
              ) : null}

              {recommendation.riskWarnings.length > 0 ? (
                <View style={styles.warningBlock}>
                  <Text style={styles.subheading}>Risk warnings</Text>
                  {recommendation.riskWarnings.map((warning) => (
                    <Text key={warning.type} style={styles.bodyText}>
                      {warning.severity}: {warning.message}
                    </Text>
                  ))}
                </View>
              ) : null}

              <View style={[styles.actionRow, styles.outfitActionRow]}>
                <ActionButton label="AI explanation" onPress={() => setActivePanel("ai")} compact />
                <ActionButton label="Rate the fit" onPress={() => setActivePanel("personalization")} compact secondary />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.bodyText}>Search and select a location to calculate the outfit.</Text>
              <ActionButton label="Back to planner" onPress={() => setActivePanel("planner")} />
            </>
          )}
        </Section>
        ) : null}

        {activePanel === "ai" ? (
        <Section title="AI explanation" meta={explanationStatus}>
          {explanation ? (
            <Text style={[styles.explanation, styles[explanationTone]]}>{explanation}</Text>
          ) : null}
          <ActionButton label="Generate explanation" onPress={() => void generateExplanation()} />
          <View style={styles.searchRow}>
            <TextInput
              value={followUpQuestion}
              onChangeText={setFollowUpQuestion}
              placeholder="Ask: do I need a hoodie?"
              placeholderTextColor="#7c8178"
              style={[styles.input, styles.searchInput]}
            />
            <ActionButton
              label="Ask"
              onPress={() => void generateExplanation(followUpQuestion.trim())}
              disabled={followUpQuestion.trim().length < 3}
              compact
            />
          </View>
          <ActionButton label="Back to recommendation" onPress={() => setActivePanel("recommendation")} secondary />
        </Section>
        ) : null}

        {activePanel === "profile" ? (
        <Section title="Account" meta={authStatus}>
          {user ? (
            <>
              <Text style={styles.bodyText}>{maskEmail(user.email)}</Text>
              <ActionButton label="Sign out" onPress={() => void signOut()} secondary />
            </>
          ) : (
            <>
              <FieldInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
              />
              <ActionButton label="Send magic link" onPress={() => void sendMagicLink()} />
            </>
          )}
        </Section>
        ) : null}

        {activePanel === "personalization" ? (
        <Section title="Personalization" meta={profileLearningCopy}>
          <View style={styles.readinessRow}>
            <Text style={styles.readiness}>{readiness}%</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${readiness}%` }]} />
            </View>
          </View>
          <Text style={styles.bodyText}>
            Stage: {recommendation?.personalizationStage.replace("_", " ") ?? "starter profile"}.
          </Text>
          <View style={styles.actionRow}>
            <ActionButton label="Good" onPress={() => void applyFeedback("good")} compact />
            <ActionButton label="Too cold" onPress={() => void applyFeedback("too_cold")} compact />
            <ActionButton label="Too warm" onPress={() => void applyFeedback("too_warm")} compact />
          </View>
          <Text style={styles.bodyText}>{profileChangeNote}</Text>
          <View style={styles.weatherStrip}>
            <Metric label="Good rate" value={feedbackStats.total > 0 ? `${feedbackStats.goodRate}%` : "New"} />
            <Metric label="Too cold" value={String(feedbackStats.tooCold)} />
            <Metric label="Too warm" value={String(feedbackStats.tooWarm)} />
          </View>
          <Text style={styles.bodyText}>{qualitySummary}</Text>
          <ActionButton
            label={user ? "Save recommendation" : "Sign in to save recommendation history"}
            onPress={() => {
              if (user) {
                void persistCurrentRecommendation();
                return;
              }

              setActivePanel("profile");
            }}
          />
          {user ? <ActionButton label="Reset profile memory" onPress={() => void resetProfile()} secondary /> : null}
          {user ? <Text style={styles.statusText}>{saveStatus}</Text> : null}
          <ActionButton label="Back to recommendation" onPress={() => setActivePanel("recommendation")} secondary />
        </Section>
        ) : null}

        {activePanel === "profile" ? (
          <>
        <Section title="Saved locations" meta={user ? favouriteStatus || "Defaults are stored on this device." : undefined}>
          <ActionButton
            label={
              user
                ? isCurrentLocationSaved
                  ? "Location saved"
                  : "Save current location"
                : "Sign in to save favourite locations"
            }
            onPress={() => void saveCurrentLocationAsFavourite()}
            disabled={user ? !currentLocation || isCurrentLocationSaved : false}
          />
          {favouriteLocations.map((location) => (
            <View key={location.favouriteId} style={styles.listItem}>
              <Pressable onPress={() => void chooseLocation(location)} style={styles.listMain}>
                <Text style={styles.listTitle}>{formatLocationLabel(location)}</Text>
                <Text style={styles.listMeta}>
                  {defaultFavouriteId === location.favouriteId ? "Default" : "Saved"}
                </Text>
              </Pressable>
              <View style={styles.listActions}>
                <ActionButton
                  label="Default"
                  onPress={() => void setDefaultFavourite(location)}
                  disabled={defaultFavouriteId === location.favouriteId}
                  compact
                  secondary
                />
                <ActionButton
                  label="Delete"
                  onPress={() => void deleteFavourite(location)}
                  compact
                  secondary
                />
              </View>
            </View>
          ))}
        </Section>

        <Section title="History">
          {recommendationHistory.length > 0 ? (
            recommendationHistory.map((item) => (
              <View key={item.id} style={styles.listItem}>
                <Pressable
                  onPress={() => setExpandedHistoryId(expandedHistoryId === item.id ? null : item.id)}
                  style={styles.listMain}
                >
                  <Text style={styles.listTitle}>{item.locationLabel}</Text>
                  <Text style={styles.listMeta}>
                    {getActivityLabel(item.activityMode)} | {item.confidenceScore}% | {formatShortDate(item.createdAt)}
                  </Text>
                  <Text style={styles.bodyText}>{item.headline}</Text>
                  {expandedHistoryId === item.id ? (
                    <Text style={styles.bodyText}>
                      Outfit: {item.outfitSummary}
                      {item.createdAtInput ? `\nStart: ${formatShortDate(item.createdAtInput)}` : ""}
                      {item.returnHomeTime ? `\nReturn: ${formatShortDate(item.returnHomeTime)}` : ""}
                    </Text>
                  ) : null}
                </Pressable>
                <ActionButton label="Repeat timing" onPress={() => repeatHistoryTiming(item)} compact secondary />
              </View>
            ))
          ) : (
            <Text style={styles.bodyText}>Save recommendations to build a useful planning history.</Text>
          )}
        </Section>
          </>
        ) : null}
      </ScrollView>
      {activePanel !== "profile" ? (
        <View style={styles.bottomNavWrap}>
          <View style={styles.bottomNav}>
            <BottomNavItem
              active={activePanel === "planner"}
              label="Plan"
              onPress={() => setActivePanel("planner")}
            />
            <BottomNavItem
              active={isOutfitNavActive}
              label="Outfit"
              onPress={() => setActivePanel("recommendation")}
              disabled={!recommendation}
            />
          </View>
        </View>
      ) : null}
      <TimePickerModal
        hour={timePickerHour}
        minute={timePickerMinute}
        title={timePickerTarget === "start" ? "Start time" : "Return time"}
        visible={timePickerTarget !== null}
        onCancel={() => setTimePickerTarget(null)}
        onChangeHour={setTimePickerHour}
        onChangeMinute={setTimePickerMinute}
        onDone={applyTimePicker}
      />
    </SafeAreaView>
  );
}

function Section({
  title,
  meta,
  prominent,
  children,
}: {
  title: string;
  meta?: string;
  prominent?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={[styles.section, prominent && styles.sectionProminent]}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {meta ? <Text style={styles.sectionMeta}>{meta}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function BottomNavItem({
  active,
  label,
  onPress,
  disabled,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.bottomNavItem,
        active && styles.bottomNavItemActive,
        disabled && styles.bottomNavItemDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.bottomNavText, active && styles.bottomNavTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function TimeSelectButton({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.timeSelect, pressed && styles.pressed]}
    >
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.timeSelectValue}>{value}</Text>
    </Pressable>
  );
}

function TimePickerModal({
  visible,
  title,
  hour,
  minute,
  onChangeHour,
  onChangeMinute,
  onCancel,
  onDone,
}: {
  visible: boolean;
  title: string;
  hour: number;
  minute: number;
  onChangeHour: (value: number) => void;
  onChangeMinute: (value: number) => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onCancel}>
      <View style={styles.modalScrim}>
        <Pressable style={styles.modalBackdrop} onPress={onCancel} />
        <View style={styles.timePickerSheet}>
          <View style={styles.timePickerHeader}>
            <Pressable onPress={onCancel} hitSlop={10}>
              <Text style={styles.timePickerLink}>Cancel</Text>
            </Pressable>
            <Text style={styles.timePickerTitle}>{title}</Text>
            <Pressable onPress={onDone} hitSlop={10}>
              <Text style={styles.timePickerDone}>Done</Text>
            </Pressable>
          </View>

          <View style={styles.timePickerWheel}>
            <View pointerEvents="none" style={styles.timePickerSelectionBand} />
            <View style={styles.timePickerColumns}>
              <WheelColumn
                label="Hour"
                options={HOUR_OPTIONS}
                selected={hour}
                onSelect={onChangeHour}
              />
              <WheelColumn
                label="Minute"
                options={MINUTE_OPTIONS}
                selected={minute}
                onSelect={onChangeMinute}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function WheelColumn({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: number[];
  selected: number;
  onSelect: (value: number) => void;
}) {
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    const index = options.indexOf(selected);

    if (index >= 0) {
      scrollRef.current?.scrollTo({
        y: index * WHEEL_ITEM_HEIGHT,
        animated: false,
      });
    }
  }, [options, selected]);

  function handleScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(event.nativeEvent.contentOffset.y / WHEEL_ITEM_HEIGHT);
    const nextValue = options[Math.max(0, Math.min(options.length - 1, index))];

    if (nextValue !== undefined && nextValue !== selected) {
      onSelect(nextValue);
    }
  }

  return (
    <View style={styles.wheelColumn}>
      <Text style={styles.wheelLabel}>{label}</Text>
      <ScrollView
        ref={scrollRef}
        style={styles.wheelScroller}
        contentContainerStyle={styles.wheelList}
        decelerationRate="fast"
        nestedScrollEnabled
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_HEIGHT}
      >
        {options.map((option) => {
          const active = option === selected;

          return (
            <Pressable
              key={option}
              onPress={() => onSelect(option)}
              style={({ pressed }) => [
                styles.wheelOption,
                active && styles.wheelOptionActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.wheelOptionText, active && styles.wheelOptionTextActive]}>
                {String(option).padStart(2, "0")}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function FieldInput({
  label,
  value,
  onChangeText,
  onBlur,
  placeholder,
  keyboardType,
  fieldStyle,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "numbers-and-punctuation";
  fieldStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.field, fieldStyle]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor="#7c8178"
        keyboardType={keyboardType}
        autoCapitalize="none"
        style={styles.input}
      />
    </View>
  );
}

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: Array<[string, string]>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.segmentGroup}>
      {options.map(([optionValue, label]) => {
        const active = optionValue === value;

        return (
          <Pressable
            key={optionValue}
            onPress={() => onChange(optionValue)}
            style={({ pressed }) => [
              styles.segment,
              active && styles.segmentActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
  compact,
  secondary,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  compact?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        secondary && styles.buttonSecondary,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText, disabled && styles.buttonDisabledText]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function OutfitPhase({ title, items }: { title: string; items: ClothingItem[] }) {
  return (
    <View style={styles.phase}>
      <Text style={styles.phaseTitle}>{title}</Text>
      <Text style={styles.phaseItems}>{items.map((item) => clothingLabels[item]).join(", ")}</Text>
    </View>
  );
}

function getActivityLabel(mode: ActivityMode) {
  if (mode === "running") {
    return "Run plan";
  }

  if (mode === "walking") {
    return "Walk / commute plan";
  }

  return "Walk / commute plan";
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function maskEmail(email?: string) {
  if (!email) {
    return "Signed in";
  }

  const [localPart, domain] = email.split("@");

  if (!domain) {
    return "***";
  }

  const visibleLocal = localPart.slice(0, Math.min(2, localPart.length));
  const [domainName, ...domainRest] = domain.split(".");
  const visibleDomain = domainName.slice(0, Math.min(2, domainName.length));
  const suffix = domainRest.length > 0 ? `.${domainRest.join(".")}` : "";

  return `${visibleLocal}***@${visibleDomain}***${suffix}`;
}

function getDefaultFavouriteStorageKey(userId: string) {
  return `shorts-ai-default-location:${userId}`;
}

async function getStoredDefaultFavouriteId(userId: string) {
  return AsyncStorage.getItem(getDefaultFavouriteStorageKey(userId));
}

async function setStoredDefaultFavouriteId(userId: string, favouriteId: string) {
  await AsyncStorage.setItem(getDefaultFavouriteStorageKey(userId), favouriteId);
}

async function clearStoredDefaultFavouriteId(userId: string) {
  await AsyncStorage.removeItem(getDefaultFavouriteStorageKey(userId));
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f4f2ec",
  },
  page: {
    flex: 1,
  },
  content: {
    padding: 18,
    paddingBottom: 126,
    gap: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 42,
    paddingTop: 2,
  },
  brandSmall: {
    color: "#141813",
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0,
  },
  profileButton: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#c7c0b1",
    backgroundColor: "#fffdf6",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  profileButtonText: {
    color: "#1f5f47",
    fontSize: 13,
    fontWeight: "800",
  },
  bottomNavWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 14,
    alignItems: "center",
    paddingHorizontal: 54,
  },
  bottomNav: {
    width: "100%",
    minHeight: 58,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(199, 192, 177, 0.78)",
    backgroundColor: "rgba(255, 253, 246, 0.96)",
    flexDirection: "row",
    alignItems: "center",
    padding: 6,
    gap: 6,
    shadowColor: "#151914",
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.16,
    shadowRadius: 22,
    elevation: 12,
  },
  bottomNavItem: {
    flex: 1,
    minHeight: 46,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomNavItemActive: {
    backgroundColor: "#1f5f47",
  },
  bottomNavItemDisabled: {
    opacity: 0.45,
  },
  bottomNavText: {
    color: "#4b554b",
    fontSize: 14,
    fontWeight: "800",
  },
  bottomNavTextActive: {
    color: "#ffffff",
  },
  section: {
    paddingTop: 8,
    gap: 16,
  },
  sectionProminent: {
    backgroundColor: "#e3edde",
    marginHorizontal: -18,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  sectionHeader: {
    gap: 4,
  },
  sectionTitle: {
    color: "#141813",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0,
  },
  sectionMeta: {
    color: "#626a5f",
    fontSize: 13,
    lineHeight: 18,
  },
  label: {
    color: "#353b34",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  controlBlock: {
    gap: 8,
  },
  field: {
    gap: 6,
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#bdb7aa",
    backgroundColor: "#fffdf6",
    color: "#151914",
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: {
    flex: 1,
  },
  optionList: {
    gap: 8,
  },
  optionButton: {
    borderBottomWidth: 1,
    borderBottomColor: "#d6d1c4",
    paddingVertical: 10,
  },
  optionText: {
    color: "#1a211b",
    fontSize: 16,
    fontWeight: "600",
  },
  segmentGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  segment: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bdb7aa",
    justifyContent: "center",
    paddingHorizontal: 13,
    backgroundColor: "#f8f6ef",
  },
  segmentActive: {
    borderColor: "#1f5f47",
    backgroundColor: "#1f5f47",
  },
  segmentText: {
    color: "#3e453d",
    fontWeight: "700",
  },
  segmentTextActive: {
    color: "#ffffff",
  },
  durationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  timeRow: {
    flexDirection: "row",
    gap: 10,
  },
  timeSelect: {
    flex: 1,
    minHeight: 72,
    borderWidth: 1,
    borderColor: "#bdb7aa",
    backgroundColor: "#fffdf6",
    borderRadius: 8,
    justifyContent: "center",
    paddingHorizontal: 12,
    gap: 4,
  },
  timeSelectValue: {
    color: "#151914",
    fontSize: 26,
    fontWeight: "800",
  },
  durationValue: {
    gap: 4,
  },
  durationText: {
    color: "#151914",
    fontSize: 24,
    fontWeight: "800",
  },
  stepper: {
    flexDirection: "row",
    gap: 8,
  },
  modalScrim: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(20, 24, 19, 0.28)",
  },
  timePickerSheet: {
    backgroundColor: "#f4f2ec",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: "#d6d1c4",
    paddingBottom: 26,
    maxHeight: 344,
  },
  timePickerHeader: {
    minHeight: 54,
    borderBottomWidth: 1,
    borderBottomColor: "#d6d1c4",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
  },
  timePickerTitle: {
    color: "#141813",
    fontSize: 16,
    fontWeight: "800",
  },
  timePickerLink: {
    color: "#626a5f",
    fontSize: 15,
    fontWeight: "700",
  },
  timePickerDone: {
    color: "#1f5f47",
    fontSize: 15,
    fontWeight: "800",
  },
  timePickerWheel: {
    height: WHEEL_HEIGHT + 42,
    justifyContent: "flex-end",
    marginHorizontal: 18,
    marginTop: 16,
    overflow: "hidden",
  },
  timePickerSelectionBand: {
    position: "absolute",
    right: 0,
    bottom: WHEEL_ITEM_HEIGHT * 2,
    left: 0,
    height: WHEEL_ITEM_HEIGHT,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d2ccbf",
    backgroundColor: "#e5e0d5",
  },
  timePickerColumns: {
    flexDirection: "row",
    gap: 14,
    height: WHEEL_HEIGHT + 24,
  },
  wheelColumn: {
    flex: 1,
    height: WHEEL_HEIGHT + 24,
  },
  wheelLabel: {
    color: "#626a5f",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 6,
    textAlign: "center",
    textTransform: "uppercase",
  },
  wheelScroller: {
    height: WHEEL_HEIGHT,
    overflow: "hidden",
  },
  wheelList: {
    paddingVertical: WHEEL_ITEM_HEIGHT * 2,
  },
  wheelOption: {
    height: WHEEL_ITEM_HEIGHT,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  wheelOptionActive: {
    backgroundColor: "transparent",
  },
  wheelOptionText: {
    color: "#777d73",
    fontSize: 24,
    fontWeight: "700",
  },
  wheelOptionTextActive: {
    color: "#1f5f47",
    fontSize: 28,
    fontWeight: "900",
  },
  weatherStrip: {
    flexDirection: "row",
    gap: 10,
  },
  metric: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: "#c9c4b6",
    paddingBottom: 8,
  },
  metricLabel: {
    color: "#6b7169",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  metricValue: {
    marginTop: 3,
    color: "#141813",
    fontSize: 20,
    fontWeight: "800",
  },
  contextLine: {
    color: "#344035",
    fontSize: 15,
    lineHeight: 21,
  },
  phaseStack: {
    gap: 8,
  },
  phase: {
    borderWidth: 1,
    borderColor: "#c7d7c2",
    borderRadius: 10,
    backgroundColor: "rgba(255, 253, 246, 0.58)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 5,
  },
  phaseTitle: {
    color: "#315c40",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  phaseItems: {
    color: "#151914",
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "700",
  },
  reminderBlock: {
    alignItems: "center",
    marginTop: 6,
    marginBottom: 4,
    paddingHorizontal: 14,
  },
  reminderText: {
    color: "#344035",
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
  },
  reminderLabel: {
    color: "#315c40",
    fontWeight: "800",
  },
  warningBlock: {
    borderTopWidth: 1,
    borderTopColor: "#c9c4b6",
    paddingTop: 10,
    gap: 6,
  },
  subheading: {
    color: "#141813",
    fontSize: 15,
    fontWeight: "800",
  },
  bodyText: {
    color: "#40483f",
    fontSize: 14,
    lineHeight: 20,
  },
  explanation: {
    fontSize: 15,
    lineHeight: 22,
  },
  neutral: {
    color: "#42483f",
  },
  success: {
    color: "#245e42",
  },
  warning: {
    color: "#8b3f2f",
  },
  button: {
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: "#1f5f47",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  buttonCompact: {
    minHeight: 40,
    paddingHorizontal: 12,
  },
  buttonSecondary: {
    backgroundColor: "#e4e0d5",
    borderWidth: 1,
    borderColor: "#c7c0b1",
  },
  buttonDisabled: {
    backgroundColor: "#d6d1c4",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  buttonSecondaryText: {
    color: "#252b25",
  },
  buttonDisabledText: {
    color: "#777d73",
  },
  pressed: {
    opacity: 0.72,
  },
  readinessRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  readiness: {
    color: "#141813",
    fontSize: 28,
    fontWeight: "800",
  },
  progressTrack: {
    flex: 1,
    height: 8,
    backgroundColor: "#d9d4c8",
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: 8,
    backgroundColor: "#1f5f47",
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  outfitActionRow: {
    justifyContent: "center",
  },
  statusText: {
    color: "#626a5f",
    fontSize: 13,
    lineHeight: 18,
  },
  listItem: {
    borderTopWidth: 1,
    borderTopColor: "#d6d1c4",
    paddingTop: 12,
    gap: 10,
  },
  listMain: {
    gap: 4,
  },
  listTitle: {
    color: "#141813",
    fontSize: 16,
    fontWeight: "800",
  },
  listMeta: {
    color: "#656d63",
    fontSize: 13,
  },
  listActions: {
    flexDirection: "row",
    gap: 8,
  },
});
