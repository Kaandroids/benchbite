import { Redirect, router } from 'expo-router';

import { ChangePasswordScreen } from '@/account/change-password-screen';
import { SectionErrorBoundary } from '@/components/error-screen';
import { useIsAccount } from '@/providers/session-provider';

// In place of the screen when it fails as it draws, with the way to Today (ADR 0150).
export const ErrorBoundary = SectionErrorBoundary;

export default function ChangePasswordRoute() {
  // Only an account has a password to change, also when a link opens this screen.
  if (!useIsAccount()) {
    return <Redirect href="/" />;
  }
  return <ChangePasswordScreen onBack={() => router.back()} onChanged={() => router.back()} />;
}
