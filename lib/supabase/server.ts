import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function createRequestSupabaseClient(request: Request) {
  const url = configured(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = configured(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const authorization = request.headers.get("authorization");

  if (!url || !anonKey || !authorization?.startsWith("Bearer ")) return null;

  return createClient<Database>(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function getRequestUser(request: Request) {
  const client = createRequestSupabaseClient(request);
  if (!client) return null;
  const token = request.headers.get("authorization")?.slice("Bearer ".length);
  if (!token) return null;
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return { client, user: data.user };
}

function configured(value: string | undefined) {
  const normalized = value?.trim();
  return !normalized || normalized.startsWith("your-") || normalized.includes("your-project")
    ? undefined
    : normalized;
}
