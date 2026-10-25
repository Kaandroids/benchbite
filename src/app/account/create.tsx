import { Redirect, router } from 'expo-router';
import { useState } from 'react';

import { CreateAccountScreen } from '@/account/create-account-screen';
import { useIsAccount } from '@/providers/session-provider';

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
        router.dismissAll();
        router.navigate('/');
      }}
    />
  );
}
