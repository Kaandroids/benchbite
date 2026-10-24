import { assert, assertEquals, assertNotEquals, assertThrows } from '@std/assert';

import { PLAN_WORKOUT_EXERCISES } from './limits.ts';
import { buildPlan } from './plan.ts';
import { candidatesFor, conditioningMinutes, exerciseSeconds } from './session.ts';
import { TEMPLATES } from './templates.ts';
import { CATALOGUE } from './test-catalogue.ts';
import type { PlanInput, PlannedExercise } from './types.ts';

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

const last = (session: { exercises: PlannedExercise[] }) =>
  session.exercises[session.exercises.length - 1]!;

Deno.test('fat loss sessions end with conditioning, as their last exercise', () => {
  const plan = buildPlan({ ...input, goal: 'lose_fat', sessionMinutes: 60 }, CATALOGUE);
  assertEquals(last(plan.sessions[0]!).exerciseId, 'Rowing');
  assertEquals(last(plan.sessions[0]!).target, { seconds: 540 });
  assertNotEquals(last(buildPlan(input, CATALOGUE).sessions[0]!).slot, 'conditioning');
});

Deno.test('short sessions keep the main exercises and drop accessories first', () => {
  const plan = buildPlan(
    { ...input, goal: 'get_stronger', sessionMinutes: 30, trainingDays: [1] },
    CATALOGUE,
  );
  const slots = plan.sessions[0]!.exercises.map((exercise) => exercise.slot);
  assertEquals(slots.slice(0, 2), ['squat', 'horizontal_push']);
});

Deno.test('conditioning takes no longer than planned', () => {
  for (const [setup, exerciseId] of [
    ['gym', 'Rowing'],
    ['bodyweight', 'Mountain_Climbers'],
  ] as const)
    for (const sessionMinutes of [45, 60] as const) {
      const plan = buildPlan({ ...input, goal: 'lose_fat', setup, sessionMinutes }, CATALOGUE);
      const conditioning = last(plan.sessions[0]!);
      assertEquals(conditioning.exerciseId, exerciseId);
      assert(
        exerciseSeconds(conditioning) <=
          conditioningMinutes({ ...input, goal: 'lose_fat', sessionMinutes }) * 60,
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
  // Only when every slot is in may a slot take another exercise.
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
              // Conditioning comes last and is not one of the template's slots.
              const slots = session.exercises
                .map((exercise) => exercise.slot)
                .filter((slot) => slot !== 'conditioning');
              const template = slots.slice(0, possible.length);
              assertEquals(template, possible.slice(0, template.length), JSON.stringify(answers));
              if (slots.length > possible.length) {
                assertEquals(template, possible, JSON.stringify(answers));
                for (const slot of slots.slice(possible.length)) {
                  assert(possible.includes(slot), `${slot} in ${JSON.stringify(answers)}`);
                }
              }
            }
          }
});

const longSession = (experience: PlanInput['experience']) =>
  buildPlan({ ...input, experience, trainingDays: [1], sessionMinutes: 75 }, CATALOGUE)
    .sessions[0]!;

Deno.test('with time left, each exercise gains one set more than prescribed', () => {
  const sets = (session: { exercises: PlannedExercise[] }) =>
    Object.fromEntries(session.exercises.map((exercise) => [exercise.exerciseId, exercise.sets]));
  // A beginner's main exercises take 3 sets and accessories 2, an intermediate's 4 and 3.
  assertEquals(sets(longSession('beginner')).Barbell_Squat, 4);
  assertEquals(sets(longSession('beginner')).Lat_Pulldown, 3);
  assertEquals(sets(longSession('intermediate')).Barbell_Squat, 5);
});

Deno.test('with time still left, the slots take another of their exercises', () => {
  const session = longSession('beginner');
  const template = TEMPLATES.full_body.length;
  assert(session.exercises.length > template, `${session.exercises.length} exercises`);
  // The first candidate not in the session yet, so the gym keeps to its own equipment.
  assertEquals(session.exercises[template], {
    exerciseId: 'Goblet_Squat',
    slot: 'squat',
    sets: 2,
    target: { reps: { min: 10, max: 15 } },
    restSeconds: 75,
  });
  assert(session.estimatedMinutes <= 75);
});

Deno.test('a workout has no more exercises than the onboarding saves', () => {
  // Many short core exercises, more than a long session would take without the limit.
  const cores = Array.from({ length: 30 }, (_, index) => ({
    slot: 'core' as const,
    exerciseId: `Core_${index}`,
    requires: 'bodyweight' as const,
    minExperience: 'beginner' as const,
    priority: index + 1,
    metrics: ['reps' as const],
  }));
  const plan = buildPlan(
    {
      ...input,
      experience: 'beginner',
      setup: 'bodyweight',
      sessionMinutes: 75,
      trainingDays: [1],
    },
    [...CATALOGUE, ...cores],
  );
  assertEquals(plan.sessions[0]!.exercises.length, PLAN_WORKOUT_EXERCISES);

  for (const setup of ['gym', 'dumbbells', 'bodyweight'] as const)
    for (const goal of ['lose_fat', 'build_muscle'] as const)
      for (const days of [1, 3, 6]) {
        const plan = buildPlan(
          {
            ...input,
            setup,
            goal,
            sessionMinutes: 75,
            trainingDays: [1, 2, 3, 4, 5, 6].slice(0, days),
          },
          CATALOGUE,
        );
        for (const session of plan.sessions) {
          assert(session.exercises.length <= PLAN_WORKOUT_EXERCISES, `${setup} ${goal} ${days}`);
        }
      }
});

Deno.test('repeated training days are rejected', () => {
  assertThrows(() => buildPlan({ ...input, trainingDays: [1, 1, 3] }, CATALOGUE), RangeError);
});
