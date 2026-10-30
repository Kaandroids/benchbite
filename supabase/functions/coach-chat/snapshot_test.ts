import { assertEquals } from '@std/assert';

import type { Client } from '../_shared/supabase.ts';
import { snapshotText } from './prompt.ts';
import { loadSnapshot } from './snapshot.ts';

const PROFILE = {
  display_name: 'Sam',
  birth_year: 1996,
  sex: 'female',
  height_cm: 165,
  weight_unit: 'kg',
  pregnant_or_breastfeeding: true,
  experience: 'beginner',
  training_setup: 'gym',
  training_days: [1, 4],
  session_minutes: 45,
};

/** A database whose profile is `profile`, and which has nothing else. */
function database(profile: Record<string, unknown>) {
  const empty = { data: null, error: null };
  const query = (data: unknown) => {
    const builder: Record<string, unknown> = {
      maybeSingle: () => Promise.resolve({ data, error: null }),
    };
    for (const method of ['select', 'order', 'limit']) builder[method] = () => builder;
    return builder;
  };
  return {
    from: (table: string) => query(table === 'profiles' ? profile : null),
    rpc: () => Promise.resolve(empty),
  } as unknown as Client;
}

Deno.test("tells Bite the user's calorie floor, as the profile gives it", async () => {
  const snapshot = await loadSnapshot(database({ ...PROFILE, calorie_floor: 1200 }), '2026-10-30');

  assertEquals(snapshot.weekday, 'Friday');
  assertEquals(snapshot.profile?.age, 30);
  const text = snapshotText(snapshot, 'en');
  assertEquals(text.includes('Calorie floor: 1200 kcal a day'), true);
  assertEquals(text.includes('Training: beginner · gym · Mon, Thu · 45 min sessions'), true);
});

Deno.test('keeps the rest of the profile when the floor cannot be read', async () => {
  const snapshot = await loadSnapshot(database({ ...PROFILE, calorie_floor: null }), '2026-10-30');

  const text = snapshotText(snapshot, 'en');
  assertEquals(text.includes('Pregnant or breastfeeding: yes'), true);
  assertEquals(text.includes('Calorie floor'), false);
});

Deno.test('names a workout without a name by its type', async () => {
  const { workoutName } = await import('./snapshot.ts');
  assertEquals(workoutName({ name: '', type: 'full_body' }), 'full body');
  assertEquals(workoutName({ name: 'Push', type: 'push' }), 'Push');
});
