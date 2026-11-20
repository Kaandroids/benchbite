// First, so that it starts before the other modules load (ADR 0149).
import '@/lib/start-reporting';

import { Nunito_500Medium } from '@expo-google-fonts/nunito/500Medium';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';
import { Nunito_900Black } from '@expo-google-fonts/nunito/900Black';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Appearance, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useClaimDevice } from '@/account/device-owner';
import { NewPasswordScreen } from '@/account/new-password-screen';
import { SessionEnded } from '@/account/session-ended';
import { AnimatedSplash } from '@/brand/animated-splash';
import { AppErrorBoundary } from '@/components/error-screen';
import { SessionError } from '@/components/session-error';
import '@/i18n';
import { wrapRoot } from '@/lib/reporting';
import { OnboardingProvider, useOnboarding } from '@/providers/onboarding-provider';
import { QueryProvider } from '@/providers/query-provider';
import { SessionProvider, useSession } from '@/providers/session-provider';
import { ReminderSync } from '@/reminders/reminder-sync';
import { useRequirements } from '@/requirements/requirements';
import { useConsentAsk } from '@/requirements/consent-update';
import { useTermsAsk } from '@/requirements/terms-update';
import { UpdateRequired } from '@/requirements/update-required';
import { showRemindersInForeground } from '@/reminders/reminders';
import { HealthCatchUp } from '@/health/health-catch-up';
import { LeftOpenSaver } from '@/sessions/left-open';
import { StartMoveSheet } from '@/sessions/start-move';
import { StartOnWatchSheet } from '@/watch/start-on-watch-sheet';
import { REST_NOTIFICATION_ID, RestAlarm } from '@/sessions/rest-alarm';
import { applyStoredPreferences } from '@/settings/preferences';
import { fonts, useTheme } from '@/theme';
import { WatchSync } from '@/watch/watch-sync';

// In place of the app when it fails as it draws (#550).
export const ErrorBoundary = AppErrorBoundary;

// Keeps the native splash screen visible until the fonts and the session are ready.
void SplashScreen.preventAutoHideAsync();
// The native splash screen follows the system's light or dark setting. Read it before the stored
// theme overrides it, so the animated splash that takes over matches.
const launchScheme = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
showRemindersInForeground([REST_NOTIFICATION_ID]);
// The look and language chosen in the settings, before the first screen shows.
applyStoredPreferences();

// Reports know the screens and touches that led to an error; this catches nothing.
export default wrapRoot(RootLayout);

function RootLayout() {
  return (
    // Gesture detectors, such as the one in the slider, only work inside this view.
    <GestureHandlerRootView style={styles.root}>
      <SessionProvider>
        <QueryProvider>
          <OnboardingProvider>
            <RootNavigator />
          </OnboardingProvider>
        </QueryProvider>
      </SessionProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const session = useSession();
  const { status, retry, startAgain, recovering } = session;
  const { completed, checking } = useOnboarding();
  useClaimDevice();
  // Asked when the app opens and each time it comes back, so that what it holds to is current.
  const requirements = useRequirements();
  // Only once the server said so of this version: without an answer the app opens (ADR 0156).
  // And only with a session, which is what asks the server: without one, an answer kept on the
  // device could never be put right, and the screen would cover the ways back to a session.
  const unsupported = status === 'ready' && requirements?.supported === false;
  // What works alongside the screens runs only in a build that may run.
  const running = status === 'ready' && !unsupported;
  // One question at a time: the terms first, then the health data consent.
  const askingTerms = useTermsAsk() !== null;
  const askingConsent = useConsentAsk() !== null && !askingTerms;
  const asking = askingTerms || askingConsent;
  const { t } = useTranslation();
  const { colors } = useTheme();
  // Keys must match the family names in `fonts`. If loading fails, text falls back to the system font.
  const [fontsLoaded, fontError] = useFonts({
    [fonts.medium]: Nunito_500Medium,
    [fonts.bold]: Nunito_700Bold,
    [fonts.extraBold]: Nunito_800ExtraBold,
    [fonts.black]: Nunito_900Black,
  });
  const isReady = (fontsLoaded || fontError !== null) && status !== 'loading';
  const [splashDone, setSplashDone] = useState(false);
  const endSplash = () => setSplashDone(true);

  // The root view shows through during screen transitions and keyboard animations.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background]);

  useEffect(() => {
    if (isReady) {
      SplashScreen.hide();
    }
  }, [isReady]);

  if (!isReady) {
    return null;
  }

  return (
    <>
      <StatusBar style="auto" />
      {running ? (
        <>
          <RestAlarm />
          <WatchSync />
        </>
      ) : null}
      {unsupported ? (
        <UpdateRequired />
      ) : status === 'error' ? (
        <SessionError onRetry={retry} />
      ) : status === 'ended' ? (
        <SessionEnded reason={session.reason} onStartAgain={startAgain} />
      ) : recovering ? (
        <NewPasswordScreen />
      ) : checking ? (
        <View style={[styles.root, styles.center, { backgroundColor: colors.background }]}>
          <ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} />
        </View>
      ) : (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          {/* Until the onboarding is finished, only the onboarding is reachable. Finishing it
              switches to the app and removes the onboarding from the history. */}
          <Stack.Protected guard={!completed}>
            <Stack.Screen name="onboarding" />
          </Stack.Protected>
          {/* New terms to accept, or a consent to give again, take the app's place (ADR 0158,
              ADR 0159); deleting the account stays in reach from the terms. */}
          <Stack.Protected guard={completed && askingTerms}>
            <Stack.Screen name="terms" options={{ gestureEnabled: false }} />
          </Stack.Protected>
          <Stack.Protected guard={completed && askingConsent}>
            <Stack.Screen name="consent" options={{ gestureEnabled: false }} />
          </Stack.Protected>
          <Stack.Protected guard={completed}>
            <Stack.Screen name="account/delete" />
          </Stack.Protected>
          <Stack.Protected guard={completed && !asking}>
            <Stack.Screen name="(app)" />
            {/* The workout in progress covers the tabs, so nothing but the workout is in reach. */}
            <Stack.Screen name="session/index" />
            <Stack.Screen name="session/finish" />
            <Stack.Screen name="session/exercise/[id]" />
            <Stack.Screen name="session/exercise/history" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="account/password" />
            {/* What premium adds, opened wherever the plan stops the user. */}
            <Stack.Screen name="premium" />
            {/* The consent to the AI features, opened by a meal photo before it is taken. */}
            <Stack.Screen name="ai-consent" />
            {/* Bite's chat, opened from the middle of the tab bar. */}
            <Stack.Screen name="bite/index" />
            <Stack.Screen name="bite/chats" />
            <Stack.Screen name="bite/notebook" />
            {/* Opened from beside the settings, in development only. */}
            <Stack.Screen name="dev/tools" />
          </Stack.Protected>
          {/* Reachable from the onboarding's first step and from the settings. */}
          {/* Both can lead to a confirmed code with only the password left, which must not be
              swiped away (ADR 0091); they close with their own button. */}
          <Stack.Screen name="account/create" options={{ gestureEnabled: false }} />
          <Stack.Screen name="account/login" options={{ gestureEnabled: false }} />
          <Stack.Screen name="dev/components" />
          <Stack.Screen name="dev/trial-ending" />
          <Stack.Screen name="dev/special-offer" />
        </Stack>
      )}
      {/* Over every screen, as the app may open on any of them. */}
      {running ? <LeftOpenSaver /> : null}
      {running ? <StartMoveSheet /> : null}
      {running ? <StartOnWatchSheet /> : null}
      {running && completed ? <ReminderSync /> : null}
      {running && completed ? <HealthCatchUp /> : null}
      {/* Drawn in the same frame the native splash screen hides, over the first screen. */}
      {splashDone ? null : <AnimatedSplash scheme={launchScheme} onDone={endSplash} />}
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
