# 0004. Store the auth session with expo-sqlite's localStorage

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

supabase-js keeps the signed-in user's session (an access token and a refresh token) in a
storage adapter and restores it when the app starts. React Native has no built-in storage the
client can use, so the app has to provide one.

The choice matters more than usual because Benchbite will let people start without an account,
using anonymous sign-ins. An anonymous user has no way to sign in again, so if the session is
lost, their data can no longer be reached.

## Decision

The session is stored through the `localStorage` polyfill from `expo-sqlite`
(`expo-sqlite/localStorage/install`). The data lives in an SQLite database inside the app's
sandbox. This is the setup recommended by both the Expo and the Supabase guides.

## Alternatives considered

- **`expo-secure-store`** (iOS Keychain, Android Keystore): encrypted at rest, but values are
  limited to about 2 KB and a Supabase session is larger. Using it means encrypting the session
  with a key that is kept in SecureStore and storing the ciphertext elsewhere, which adds code
  and a dependency for a security gain that the current data does not need. On iOS, Keychain
  items can also survive a reinstall, which would make the anonymous-session problem slightly
  smaller, but not on Android.
- **`@react-native-async-storage/async-storage`**: the long-standing community option, with
  the same security level as `expo-sqlite`. `expo-sqlite` is maintained by Expo, ships with
  Expo Go and can be used for local data later.

## Consequences

- The session is unencrypted inside the app sandbox, which other apps cannot read. Someone
  with access to an unlocked or rooted device could read it. Refresh tokens can be revoked on
  the server.
- Uninstalling the app or clearing its data deletes the session. For anonymous users this means
  losing access to their data, so the app has to encourage them to create an account.
- If Benchbite starts storing more sensitive data, moving to an encrypted store is a change in
  `src/lib/supabase.ts` and is recorded in a new ADR.
