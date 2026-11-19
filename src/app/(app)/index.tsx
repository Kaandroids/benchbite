import { TodayErrorBoundary } from '@/components/error-screen';
import { TodayScreen } from '@/today/today-screen';

// In place of Today when it fails as it draws, under the tabs.
export const ErrorBoundary = TodayErrorBoundary;

export default function TodayTab() {
  return <TodayScreen />;
}
