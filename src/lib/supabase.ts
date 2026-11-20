// Provides the global `localStorage` that the client uses to persist the session on the device.
import 'expo-sqlite/localStorage/install';

import { createClient } from '@supabase/supabase-js';
import { nativeApplicationVersion } from 'expo-application';
import { AppState, Platform } from 'react-native';

import type { Database } from './database.types';
import { noteResponse } from './version-refusal';

// Expo inlines EXPO_PUBLIC_ variables at build time, so they must be read with dot notation.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set. ' +
      'Copy .env.example to .env.local and restart the dev server.',
  );
}

/** The address of an Edge Function, for a call that reads its answer as it streams. */
export function functionUrl(name: string): string {
  return `${supabaseUrl}/functions/v1/${name}`;
}

/** The project's publishable key, which every request to it carries. */
export const publishableKey: string = supabasePublishableKey;

/**
 * The build a request comes from, which every request names: the backend refuses a version of
 * the app that is no longer supported (ADR 0157). A request without them is not judged.
 */
export const appVersionHeaders: Record<string, string> = nativeApplicationVersion
  ? { 'x-app-platform': Platform.OS, 'x-app-version': nativeApplicationVersion }
  : {};

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  global: {
    headers: appVersionHeaders,
    // Every answer is looked at for the backend's refusal of this build.
    fetch: (...args) => fetch(...args).then(noteResponse),
  },
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// On mobile the client cannot tell whether the app is in the foreground, so token refresh is
// paused in the background and resumed when the app becomes active again.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});

/**
 * The headers of a JSON request to an Edge Function: the publishable key, the signed-in user's
 * token, which the function checks, and the build the request comes from.
 */
export async function functionHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    'content-type': 'application/json',
    apikey: publishableKey,
    ...appVersionHeaders,
    ...(token && { authorization: `Bearer ${token}` }),
  };
}
