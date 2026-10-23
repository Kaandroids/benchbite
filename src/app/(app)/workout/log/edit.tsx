import { useLocalSearchParams } from 'expo-router';

import { EditLogScreen } from '@/history/edit-log-screen';

/** Corrects the sets of a finished workout. */
export default function EditLog() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EditLogScreen id={Number(id)} />;
}
