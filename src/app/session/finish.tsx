import { useLocalSearchParams } from 'expo-router';

import { SectionErrorBoundary } from '@/components/error-screen';
import { FinishScreen } from '@/sessions/finish-screen';

// In place of the screen when it fails as it draws, with the way to Today (ADR 0150).
export const ErrorBoundary = SectionErrorBoundary;

/** The summary of the workout in progress, where it is saved; then starts the `next` one, if any. */
export default function Finish() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  return <FinishScreen next={next ? Number(next) : undefined} />;
}
