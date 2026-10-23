import { useLocalSearchParams } from 'expo-router';

import { LogScreen } from '@/history/log-screen';

/** One finished workout. */
export default function Log() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LogScreen id={Number(id)} />;
}
