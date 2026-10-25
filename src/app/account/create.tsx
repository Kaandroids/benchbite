import { router } from 'expo-router';

import { CreateAccountScreen } from '@/account/create-account-screen';

export default function CreateAccountRoute() {
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
