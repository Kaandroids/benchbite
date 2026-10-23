import { useLocalSearchParams } from 'expo-router';

import { FinishScreen } from '@/sessions/finish-screen';

/** The summary of the workout in progress, where it is saved; then starts the `next` one, if any. */
export default function Finish() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  return <FinishScreen next={next ? Number(next) : undefined} />;
}
