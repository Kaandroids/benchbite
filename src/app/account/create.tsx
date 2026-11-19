import { Redirect, router } from 'expo-router';
import { useState } from 'react';

import { CreateAccountScreen } from '@/account/create-account-screen';
import { SectionErrorBoundary } from '@/components/error-screen';
import { useIsAccount } from '@/providers/session-provider';

// In place of the screen when it fails as it draws, with the way to Today (ADR 0150).
export const ErrorBoundary = SectionErrorBoundary;

export default function CreateAccountRoute() {
  // Only a guest creates an account, also when a link opens this screen. Decided once, as the
  // guest becomes an account here.
  const [isAccount] = useState(useIsAccount());
  if (isAccount) {
    return <Redirect href="/" />;
  }
  return (
    <CreateAccountScreen
      onClose={() => router.back()}
      onLogIn={() => router.replace('/account/login')}
      // A guest who finished the onboarding keeps their data, so the app goes on with it on Today.
      onCreated={() => {
        // Nothing is under this screen when a link opened it.
        if (router.canDismiss()) {
          router.dismissAll();
        }
        router.navigate('/');
      }}
    />
  );
}
