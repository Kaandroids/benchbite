import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { SessionError } from '@/components/session-error';
import { SessionProvider, useSession } from '@/providers/session-provider';

// Keeps the native splash screen visible until the session is known.
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

  useEffect(() => {
    if (status !== 'loading') {
      SplashScreen.hide();
    }
  }, [status]);

  if (status === 'loading') {
    return null;
  }

  if (status === 'error') {
    return <SessionError onRetry={retry} />;
  }

  return <Stack />;
}
