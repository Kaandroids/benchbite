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
import { SessionEnded } from '@/account/session-ended';
import { AnimatedSplash } from '@/brand/animated-splash';
import { SessionError } from '@/components/session-error';
import '@/i18n';
import { OnboardingProvider, useOnboarding } from '@/providers/onboarding-provider';
import { QueryProvider } from '@/providers/query-provider';
import { SessionProvider, useSession } from '@/providers/session-provider';
import { ReminderSync } from '@/reminders/reminder-sync';
import { showRemindersInForeground } from '@/reminders/reminders';
import { LeftOpenSaver } from '@/sessions/left-open';
import { StartMoveSheet } from '@/sessions/start-move';
import { REST_NOTIFICATION_ID, RestAlarm } from '@/sessions/rest-alarm';
import { applyStoredPreferences } from '@/settings/preferences';
import { fonts, useTheme } from '@/theme';

// Keeps the native splash screen visible until the fonts and the session are ready.
void SplashScreen.preventAutoHideAsync();
// The native splash screen follows the system's light or dark setting. Read it before the stored
// theme overrides it, so the animated splash that takes over matches.
const launchScheme = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
showRemindersInForeground([REST_NOTIFICATION_ID]);
// The look and language chosen in the settings, before the first screen shows.
applyStoredPreferences();

export default function RootLayout() {
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
  const { status, retry, startAgain } = useSession();
  const { completed, checking } = useOnboarding();
  useClaimDevice();
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
      {status === 'ready' ? <RestAlarm /> : null}
      {status === 'error' ? (
        <SessionError onRetry={retry} />
      ) : status === 'ended' ? (
        <SessionEnded onStartAgain={startAgain} />
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
          <Stack.Protected guard={completed}>
            <Stack.Screen name="(app)" />
            {/* The workout in progress covers the tabs, so nothing but the workout is in reach. */}
            <Stack.Screen name="session/index" />
            <Stack.Screen name="session/finish" />
            <Stack.Screen name="session/exercise/[id]" />
            <Stack.Screen name="session/exercise/history" />
            <Stack.Screen name="settings" />
            {/* Opened from beside the settings, in development only. */}
            <Stack.Screen name="dev/tools" />
          </Stack.Protected>
          {/* Reachable from the onboarding's first step and from the settings. */}
          <Stack.Screen name="account/create" />
          <Stack.Screen name="account/login" />
          <Stack.Screen name="dev/components" />
        </Stack>
      )}
      {/* Over every screen, as the app may open on any of them. */}
      {status === 'ready' ? <LeftOpenSaver /> : null}
      {status === 'ready' ? <StartMoveSheet /> : null}
      {status === 'ready' && completed ? <ReminderSync /> : null}
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
