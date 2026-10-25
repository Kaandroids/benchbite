import { Redirect, router } from 'expo-router';

import { LogInScreen } from '@/account/log-in-screen';
import { useOnboarding } from '@/providers/onboarding-provider';
import { useIsAccount } from '@/providers/session-provider';

export default function LogInRoute() {
  // Only a guest logs in, also when a link opens this screen; an account logs out first. One who
  // finished the onboarding has data that would stay behind.
  const { completed } = useOnboarding();
  if (useIsAccount()) {
    return <Redirect href="/" />;
  }
  return (
    <LogInScreen
      onClose={() => router.back()}
      onCreateAccount={() => router.replace('/account/create')}
      leavesGuestData={completed}
    />
  );
}
