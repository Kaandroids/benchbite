import { Nunito_500Medium } from '@expo-google-fonts/nunito/500Medium';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';
import { Nunito_900Black } from '@expo-google-fonts/nunito/900Black';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';

import { SessionError } from '@/components/session-error';
import { SessionProvider, useSession } from '@/providers/session-provider';
import { fonts, useTheme } from '@/theme';

// Keeps the native splash screen visible until the fonts and the session are ready.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  );
}

function RootNavigator() {
  const { status, retry } = useSession();
  const { colors } = useTheme();
  // Keys must match the family names in `fonts`. If loading fails, text falls back to the system font.
  const [fontsLoaded, fontError] = useFonts({
    [fonts.medium]: Nunito_500Medium,
    [fonts.bold]: Nunito_700Bold,
    [fonts.extraBold]: Nunito_800ExtraBold,
    [fonts.black]: Nunito_900Black,
  });
  const isReady = (fontsLoaded || fontError !== null) && status !== 'loading';

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
      {status === 'error' ? (
        <SessionError onRetry={retry} />
      ) : (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        />
      )}
    </>
  );
}
