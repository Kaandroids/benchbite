import { ChatsScreen } from '@/coach/chats-screen';
import { SectionErrorBoundary } from '@/components/error-screen';

// In place of the screen when it fails as it draws.
export const ErrorBoundary = SectionErrorBoundary;

/** Bite's chat history, opened from the chat's top bar. */
export default function Chats() {
  return <ChatsScreen />;
}
