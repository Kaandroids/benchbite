import { useLocalSearchParams } from 'expo-router';

import { SectionErrorBoundary } from '@/components/error-screen';
import { LicenceScreen } from '@/licences/licence-screen';

// In place of the screen when it fails as it draws, with the way to Today (ADR 0150).
export const ErrorBoundary = SectionErrorBoundary;

export default function LicenceRoute() {
  const { licence } = useLocalSearchParams<{ licence: string }>();
  return <LicenceScreen index={Number(licence)} />;
}
