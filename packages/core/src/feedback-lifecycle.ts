export type NotificationPermissionState = "granted" | "denied" | "undetermined";

export function getFeedbackDueAt(returnHomeTime: string) {
  const returnTime = new Date(returnHomeTime).getTime();
  if (!Number.isFinite(returnTime)) throw new Error("Return-home time is invalid.");
  return new Date(returnTime + 15 * 60_000).toISOString();
}

export function getFeedbackRecoveryMode(permission: NotificationPermissionState) {
  return permission === "granted" ? "notification" as const : "in_app" as const;
}

export function createFeedbackDeepLink(clientRequestId: string, scheme = "shortsai") {
  return `${scheme}://feedback/${encodeURIComponent(clientRequestId)}`;
}

export function parseFeedbackDeepLink(value: string) {
  const match = value.match(/^[a-z][a-z0-9+.-]*:\/\/feedback\/([^/?#]+)$/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
