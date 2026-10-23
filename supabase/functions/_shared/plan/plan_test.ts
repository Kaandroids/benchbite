import { assert, assertEquals, assertNotEquals, assertThrows } from '@std/assert';

import { buildPlan } from './plan.ts';
import { candidatesFor, exerciseSeconds, finisherMinutes } from './session.ts';
import { TEMPLATES } from './templates.ts';
import { CATALOGUE } from './test-catalogue.ts';
import type { PlanInput } from './types.ts';

const input: PlanInput = {
  goal: 'build_muscle',
  experience: 'intermediate',
  trainingDays: [5, 1, 3],
  setup: 'gym',
  sessionMinutes: 60,
};

const ids = (input: PlanInput) =>
  buildPlan(input, CATALOGUE).sessions.map((session) =>
    session.exercises.map((exercise) => exercise.exerciseId),
  );

Deno.test('candidates respect the setup, the experience and the order', () => {
  const squats = (setup: PlanInput['setup'], experience: PlanInput['experience']) =>
    candidatesFor(CATALOGUE, 'squat', setup, experience).map((entry) => entry.exerciseId);
  assertEquals(squats('gym', 'beginner'), ['Barbell_Squat', 'Goblet_Squat', 'Bodyweight_Squat']);
  assertEquals(squats('gym', 'advanced'), [
    'Barbell_Squat',
    'Goblet_Squat',
    'Front_Squat',
    'Bodyweight_Squat',
  ]);
  assertEquals(squats('dumbbells', 'advanced'), ['Goblet_Squat', 'Bodyweight_Squat']);
  assertEquals(squats('bodyweight', 'advanced'), ['Bodyweight_Squat']);
});

Deno.test('sessions follow the training days in order', () => {
  const plan = buildPlan(input, CATALOGUE);
  assertEquals(
    plan.sessions.map((session) => [session.weekdays, session.type]),
    [
      [[1], 'push'],
      [[3], 'pull'],
      [[5], 'legs'],
    ],
  );
});

Deno.test('a repeated type is one session on each of its days', () => {
  const sessionsOf = (trainingDays: number[], experience: PlanInput['experience']) =>
    buildPlan({ ...input, experience, trainingDays }, CATALOGUE).sessions.map((session) => [
      session.type,
      session.weekdays,
    ]);
  assertEquals(sessionsOf([1, 3, 5], 'beginner'), [['full_body', [1, 3, 5]]]);
  assertEquals(sessionsOf([1, 2, 4, 5], 'intermediate'), [
    ['upper', [1, 4]],
    ['lower', [2, 5]],
  ]);
  assertEquals(sessionsOf([1, 2, 3, 4, 5], 'intermediate'), [
    ['upper', [1, 4]],
    ['lower', [2, 5]],
    ['full_body', [3]],
  ]);
  assertEquals(sessionsOf([1, 2, 3, 4, 5, 6], 'intermediate'), [
    ['push', [1, 4]],
    ['pull', [2, 5]],
    ['legs', [3, 6]],
  ]);
});

Deno.test('the same answers give the same plan', () => {
  assertEquals(buildPlan(input, CATALOGUE), buildPlan(input, CATALOGUE));
});

Deno.test('no session repeats an exercise', () => {
  for (const session of ids({ ...input, trainingDays: [1, 2, 3, 4, 5, 6] })) {
    assertEquals(new Set(session).size, session.length);
  }
});

Deno.test('bodyweight plans leave out slots without a bodyweight exercise', () => {
  const plan = buildPlan({ ...input, setup: 'bodyweight', trainingDays: [1, 3, 5, 6] }, CATALOGUE);
  const upper = plan.sessions[0]!;
  assertEquals(upper.type, 'upper');
  assertEquals(
    upper.exercises.map((exercise) => exercise.exerciseId),
    ['Pushups', 'Inverted_Row', 'Bench_Dips'],
  );
});

Deno.test('every session fits into the chosen length', () => {
  for (const sessionMinutes of [30, 45, 60, 75] as const) {
    for (const goal of ['lose_fat', 'build_muscle', 'get_stronger', 'stay_healthy'] as const) {
      for (const days of [1, 3, 4, 6]) {
        const plan = buildPlan(
          { ...input, goal, sessionMinutes, trainingDays: [1, 2, 3, 4, 5, 6].slice(0, days) },
          CATALOGUE,
        );
        for (const session of plan.sessions) {
          assert(session.estimatedMinutes <= sessionMinutes, `${goal} ${sessionMinutes} min`);
          assert(session.exercises.length >= 2, `${goal} ${sessionMinutes} min has exercises`);
        }
      }
    }
  }
});

Deno.test('fat loss sessions end with conditioning', () => {
  const plan = buildPlan({ ...input, goal: 'lose_fat', sessionMinutes: 60 }, CATALOGUE);
  assertEquals(plan.sessions[0]!.finisher?.exerciseId, 'Rowing');
  assertEquals(plan.sessions[0]!.finisher?.target, { seconds: 540 });
  assertEquals(buildPlan(input, CATALOGUE).sessions[0]!.finisher, null);
});

Deno.test('short sessions keep the main exercises and drop accessories first', () => {
  const plan = buildPlan(
    { ...input, goal: 'get_stronger', sessionMinutes: 30, trainingDays: [1] },
    CATALOGUE,
  );
  const slots = plan.sessions[0]!.exercises.map((exercise) => exercise.slot);
  assertEquals(slots.slice(0, 2), ['squat', 'horizontal_push']);
});

Deno.test('finishers take no longer than planned', () => {
  for (const [setup, exerciseId] of [
    ['gym', 'Rowing'],
    ['bodyweight', 'Mountain_Climbers'],
  ] as const)
    for (const sessionMinutes of [45, 60] as const) {
      const plan = buildPlan({ ...input, goal: 'lose_fat', setup, sessionMinutes }, CATALOGUE);
      const finisher = plan.sessions[0]!.finisher!;
      assertEquals(finisher.exerciseId, exerciseId);
      assert(
        exerciseSeconds(finisher) <=
          finisherMinutes({ ...input, goal: 'lose_fat', sessionMinutes }) * 60,
      );
    }
});

Deno.test('30-minute sessions take one set less and fit more exercises', () => {
  const plan = buildPlan(
    {
      ...input,
      goal: 'lose_fat',
      setup: 'dumbbells',
      sessionMinutes: 30,
      trainingDays: [1, 2, 4, 5],
    },
    CATALOGUE,
  );
  const upper = plan.sessions[0]!;
  assertEquals(upper.exercises[0]!.sets, 3);
  assert(upper.exercises.length >= 3, `${upper.exercises.length} exercises`);
});

Deno.test('hinges are only trained on leg and full body days', () => {
  const plan = buildPlan({ ...input, trainingDays: [1, 2, 3, 4, 5, 6] }, CATALOGUE);
  for (const session of plan.sessions) {
    const hinges = session.exercises.filter((exercise) => exercise.slot === 'hinge');
    assertEquals(hinges.length > 0, session.type === 'legs', session.type);
  }
});

Deno.test('no two sessions of a week are the same', () => {
  for (let days = 2; days <= 6; days++) {
    for (const experience of ['beginner', 'intermediate'] as const) {
      const sessions = ids({
        ...input,
        experience,
        trainingDays: [1, 2, 3, 4, 5, 6].slice(0, days),
      });
      const distinct = new Set(sessions.map((session) => session.join()));
      assertEquals(distinct.size, sessions.length, `${days} days, ${experience}`);
    }
  }
});

Deno.test('a slot that comes back later in the week takes the next exercise', () => {
  const [upper, lower, fullBody] = buildPlan(
    { ...input, trainingDays: [1, 2, 3, 4, 5] },
    CATALOGUE,
  ).sessions;
  const first = (session: typeof upper, slot: string) =>
    session!.exercises.find((exercise) => exercise.slot === slot)?.exerciseId;
  assertNotEquals(first(upper, 'horizontal_push'), first(fullBody, 'horizontal_push'));
  assertNotEquals(first(lower, 'squat'), first(fullBody, 'squat'));
});

Deno.test('when time runs out, the remaining slots are left out in order', () => {
  for (const setup of ['gym', 'dumbbells', 'bodyweight'] as const)
    for (const experience of ['beginner', 'intermediate', 'advanced'] as const)
      for (const goal of ['lose_fat', 'build_muscle', 'get_stronger', 'stay_healthy'] as const)
        for (const sessionMinutes of [30, 45, 60, 75] as const)
          for (const days of [1, 3, 4, 5, 6]) {
            const answers = { setup, experience, goal, sessionMinutes };
            const plan = buildPlan(
              { ...answers, trainingDays: [1, 2, 3, 4, 5, 6].slice(0, days) },
              CATALOGUE,
            );
            for (const session of plan.sessions) {
              // The template's slots that the setup has an exercise for, in order.
              const possible = TEMPLATES[session.type]
                .map(({ slot }) => slot)
                .filter((slot) => candidatesFor(CATALOGUE, slot, setup, experience).length > 0);
              const slots = session.exercises.map((exercise) => exercise.slot);
              assertEquals(slots, possible.slice(0, slots.length), JSON.stringify(answers));
            }
          }
});

Deno.test('repeated training days are rejected', () => {
  assertThrows(() => buildPlan({ ...input, trainingDays: [1, 1, 3] }, CATALOGUE), RangeError);
});
