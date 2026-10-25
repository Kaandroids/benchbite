import { router } from 'expo-router';

import { LogInScreen } from '@/account/log-in-screen';
import { useOnboarding } from '@/providers/onboarding-provider';

export default function LogInRoute() {
  // Only a guest logs in. One who finished the onboarding has data that would stay behind.
  const { completed } = useOnboarding();
  return (
    <LogInScreen
      onClose={() => router.back()}
      onCreateAccount={() => router.replace('/account/create')}
      leavesGuestData={completed}
    />
  );
}
