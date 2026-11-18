import { NotebookScreen } from '@/coach/notebook-screen';
import { SectionErrorBoundary } from '@/components/error-screen';

// In place of the screen when it fails as it draws.
export const ErrorBoundary = SectionErrorBoundary;

/** Bite's notebook, opened from the chat's top bar and from a note under an answer. */
export default function Notebook() {
  return <NotebookScreen />;
}
