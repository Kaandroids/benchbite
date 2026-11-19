import { router } from 'expo-router';

import { SectionErrorBoundary } from '@/components/error-screen';
import { PremiumScreen } from '@/premium/premium-screen';

// In place of the screen when it fails as it draws, with the way to Today (ADR 0150).
export const ErrorBoundary = SectionErrorBoundary;

export default function PremiumRoute() {
  return <PremiumScreen onClose={() => router.back()} />;
}
