import { Redirect, router } from 'expo-router';

import { ChangePasswordScreen } from '@/account/change-password-screen';
import { useIsAccount } from '@/providers/session-provider';

export default function ChangePasswordRoute() {
  // Only an account has a password to change, also when a link opens this screen.
  if (!useIsAccount()) {
    return <Redirect href="/" />;
  }
  return <ChangePasswordScreen onBack={() => router.back()} onChanged={() => router.back()} />;
}
