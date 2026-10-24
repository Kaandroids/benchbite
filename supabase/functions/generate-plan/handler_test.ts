import { assertEquals } from '@std/assert';

import { CATALOGUE } from '../_shared/plan/test-catalogue.ts';
import { handlePlanRequest } from './handler.ts';

// The catalogue as the database returns it, or an error in its place.
const database = (result: { data: unknown; error: unknown }) =>
  ({ from: () => ({ select: () => Promise.resolve(result) }) }) as never;

const ROWS = CATALOGUE.map((entry) => ({
  slot: entry.slot,
  exercise_id: entry.exerciseId,
  requires: entry.requires,
  min_experience: entry.minExperience,
  priority: entry.priority,
  exercises: { metrics: entry.metrics },
}));

const ANSWERS = {
  goal: 'build_muscle',
  experience: 'beginner',
  trainingDays: [1, 3, 5],
  setup: 'gym',
  sessionMinutes: 45,
};

const post = (body: unknown) =>
  new Request('http://localhost/generate-plan', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

Deno.test('builds the plan for the answers', async () => {
  const response = await handlePlanRequest(post(ANSWERS), database({ data: ROWS, error: null }));
  assertEquals(response.status, 200);
  const plan = await response.json();
  assertEquals(
    plan.sessions.flatMap((session: { weekdays: number[] }) => session.weekdays).sort(),
    [1, 3, 5],
  );
});

Deno.test('takes only POST requests', async () => {
  const response = await handlePlanRequest(
    new Request('http://localhost/generate-plan'),
    database({ data: ROWS, error: null }),
  );
  assertEquals(response.status, 405);
  assertEquals(await response.json(), { error: 'method_not_allowed' });
});

Deno.test('refuses answers that are not valid, and a body that is not JSON', async () => {
  for (const body of [
    { ...ANSWERS, goal: 'fly' },
    { ...ANSWERS, trainingDays: [1, 1] },
    { ...ANSWERS, trainingDays: [1, 2, 3, 4, 5, 6, 7] },
    { ...ANSWERS, sessionMinutes: 50 },
    'not json',
  ]) {
    const response = await handlePlanRequest(post(body), database({ data: ROWS, error: null }));
    assertEquals(response.status, 400);
    assertEquals((await response.json()).error, 'invalid_request');
  }
});

Deno.test('says so when the catalogue cannot be read', async () => {
  const error = console.error;
  console.error = () => {};
  try {
    const response = await handlePlanRequest(
      post(ANSWERS),
      database({ data: null, error: new Error('down') }),
    );
    assertEquals(response.status, 500);
    assertEquals(await response.json(), { error: 'catalogue_unavailable' });
  } finally {
    console.error = error;
  }
});
