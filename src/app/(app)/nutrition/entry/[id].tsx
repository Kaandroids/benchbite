import { useLocalSearchParams } from 'expo-router';

import { EntryScreen } from '@/nutrition/entry-screen';

export default function EditEntry() {
  const { id, day } = useLocalSearchParams<{ id: string; day: string }>();
  return <EntryScreen id={Number(id)} day={day} />;
}
