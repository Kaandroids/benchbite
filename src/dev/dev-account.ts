/**
 * The account `supabase/seed.sql` creates in the local database, with the onboarding finished
 * (#246). Its password is a placeholder that only the local database knows, not a secret.
 */
export const DEV_ACCOUNT = { email: 'dev@benchbite.local', password: 'benchbite-dev' };

/**
 * Whether the app talks to a Supabase on this computer or the local network, which `supabase db
 * reset` seeds; a hosted project has no dev account.
 */
export function isLocalSupabase(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    // The computer, seen from the Android emulator.
    host === '10.0.2.2' ||
    /^192\.168\.\d+\.\d+$/.test(host) ||
    /^10\.\d+\.\d+\.\d+$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)
  );
}

/** Whether the dev account can be used: in development, against the local database. */
export const canUseDevAccount = () =>
  __DEV__ && isLocalSupabase(process.env.EXPO_PUBLIC_SUPABASE_URL);
