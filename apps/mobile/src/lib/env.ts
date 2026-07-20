export const mobileEnv = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  apiBaseUrl: normalizeMobileApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL),
};

export function normalizeMobileApiBaseUrl(value: string | undefined) {
  const normalized = value?.trim().replace(/\/$/, "") ?? "";
  if (!normalized) return "";
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return `http://${normalized}`;
}
