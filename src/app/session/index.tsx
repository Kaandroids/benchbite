import { SectionErrorBoundary } from '@/components/error-screen';
import { SessionScreen } from '@/sessions/session-screen';

// In place of the screen when it fails as it draws, with the way to Today (ADR 0150).
export const ErrorBoundary = SectionErrorBoundary;

/** The workout in progress. */
export default function Session() {
  return <SessionScreen />;
}
