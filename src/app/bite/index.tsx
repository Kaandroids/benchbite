import { BiteScreen } from '@/coach/bite-screen';
import { SectionErrorBoundary } from '@/components/error-screen';

// In place of the screen when it fails as it draws.
export const ErrorBoundary = SectionErrorBoundary;

/** The chat with Bite, over the tabs. */
export default function Bite() {
  return <BiteScreen />;
}
