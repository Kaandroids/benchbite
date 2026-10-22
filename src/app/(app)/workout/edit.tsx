import { useLocalSearchParams } from 'expo-router';

import { EditorScreen } from '@/workouts/editor-screen';

/** Edits the workout with the id, or creates a new one without. */
export default function EditWorkout() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <EditorScreen id={id ? Number(id) : undefined} />;
}
