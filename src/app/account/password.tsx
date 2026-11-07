import { router } from 'expo-router';

import { ChangePasswordScreen } from '@/account/change-password-screen';

export default function ChangePasswordRoute() {
  return <ChangePasswordScreen onBack={() => router.back()} onChanged={() => router.back()} />;
}
