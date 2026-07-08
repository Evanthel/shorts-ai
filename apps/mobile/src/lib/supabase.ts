import "react-native-url-polyfill/auto";

import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shorts-ai/core";
import { mobileEnv } from "./env";

let mobileClient: SupabaseClient<Database> | null = null;
const secureStoreChunkSize = 1800;
const secureStoreManifestPrefix = "chunked:";
const secureAuthStorage = {
  async getItem(key: string) {
    const stored = await SecureStore.getItemAsync(key);

    if (!stored?.startsWith(secureStoreManifestPrefix)) {
      return stored;
    }

    const chunkCount = Number(stored.slice(secureStoreManifestPrefix.length));

    if (!Number.isInteger(chunkCount) || chunkCount < 1) {
      return null;
    }

    const chunks = await Promise.all(
      Array.from({ length: chunkCount }, (_, index) => SecureStore.getItemAsync(getChunkKey(key, index))),
    );

    if (chunks.some((chunk) => chunk === null)) {
      return null;
    }

    return chunks.join("");
  },
  async setItem(key: string, value: string) {
    await secureAuthStorage.removeItem(key);

    if (value.length <= secureStoreChunkSize) {
      await SecureStore.setItemAsync(key, value);
      return;
    }

    const chunks = value.match(new RegExp(`.{1,${secureStoreChunkSize}}`, "g")) ?? [];

    await Promise.all(
      chunks.map((chunk, index) => SecureStore.setItemAsync(getChunkKey(key, index), chunk)),
    );
    await SecureStore.setItemAsync(key, `${secureStoreManifestPrefix}${chunks.length}`);
  },
  async removeItem(key: string) {
    const stored = await SecureStore.getItemAsync(key);

    if (stored?.startsWith(secureStoreManifestPrefix)) {
      const chunkCount = Number(stored.slice(secureStoreManifestPrefix.length));

      if (Number.isInteger(chunkCount) && chunkCount > 0) {
        await Promise.all(
          Array.from({ length: chunkCount }, (_, index) =>
            SecureStore.deleteItemAsync(getChunkKey(key, index)),
          ),
        );
      }
    }

    await SecureStore.deleteItemAsync(key);
  },
};

export function isSupabaseConfigured() {
  return Boolean(mobileEnv.supabaseUrl && mobileEnv.supabaseAnonKey);
}

export function getAuthRedirectUrl() {
  return Linking.createURL("auth/callback", {
    scheme: "shortsai",
  });
}

export function createMobileSupabaseClient() {
  if (!mobileEnv.supabaseUrl || !mobileEnv.supabaseAnonKey) {
    throw new Error("Supabase environment variables are not configured.");
  }

  mobileClient ??= createClient<Database>(
    mobileEnv.supabaseUrl,
    mobileEnv.supabaseAnonKey,
    {
      auth: {
        storage: secureAuthStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    },
  );

  return mobileClient;
}

export async function exchangeAuthUrl(url: string) {
  if (!isSupabaseConfigured()) {
    return;
  }

  const supabase = createMobileSupabaseClient();
  const parsed = new URL(url);
  const code = parsed.searchParams.get("code");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      throw error;
    }
  }
}

function getChunkKey(key: string, index: number) {
  return `${key}.${index}`;
}
