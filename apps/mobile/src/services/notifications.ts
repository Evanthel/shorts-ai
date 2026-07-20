import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import type { RecommendationInput, RecommendationResult } from "@shorts-ai/core";
import { createFeedbackDeepLink, getFeedbackRecoveryMode, parseFeedbackDeepLink } from "@shorts-ai/core";

const PENDING_KEY = "shortsai.pending-feedback.v2";

export type LocalPendingFeedback = {
  clientRequestId: string;
  recommendationId: string | null;
  selectedVariantId: string;
  dueAt: string;
  input: RecommendationInput;
  result: RecommendationResult;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function scheduleFeedbackNotification(pending: LocalPendingFeedback) {
  await saveLocalPendingFeedback(pending);
  const permission = await Notifications.getPermissionsAsync();
  const status = permission.status === "undetermined"
    ? (await Notifications.requestPermissionsAsync()).status
    : permission.status;
  if (getFeedbackRecoveryMode(status) === "in_app") return { scheduled: false as const, reason: "denied" as const };

  const triggerDate = new Date(Math.max(Date.now() + 1_000, new Date(pending.dueAt).getTime()));
  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: "How did your outfit feel?",
      body: "Rate the outfit you chose for this activity.",
      data: {
        url: createFeedbackDeepLink(pending.clientRequestId),
        clientRequestId: pending.clientRequestId,
      },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
  });
  return { scheduled: true as const, identifier };
}

export async function saveLocalPendingFeedback(pending: LocalPendingFeedback) {
  const current = await loadLocalPendingFeedback();
  const next = [pending, ...current.filter((item) => item.clientRequestId !== pending.clientRequestId)];
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(next.slice(0, 20)));
}

export async function loadLocalPendingFeedback(): Promise<LocalPendingFeedback[]> {
  const raw = await AsyncStorage.getItem(PENDING_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPending) : [];
  } catch { return []; }
}

export async function completeLocalPendingFeedback(clientRequestId: string) {
  const current = await loadLocalPendingFeedback();
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(
    current.filter((item) => item.clientRequestId !== clientRequestId),
  ));
}

export function getFeedbackClientRequestId(url: string) {
  return parseFeedbackDeepLink(url);
}

function isPending(value: unknown): value is LocalPendingFeedback {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<LocalPendingFeedback>;
  return typeof item.clientRequestId === "string" && typeof item.selectedVariantId === "string" &&
    typeof item.dueAt === "string" && Boolean(item.input) && Boolean(item.result);
}
