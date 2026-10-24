// Calls the generate-plan Edge Function of the local Supabase stack for every combination of
// onboarding answers and checks each plan against the real exercise catalogue. Run with
// `pnpm check:plans` while the stack is running.

import { Constants, type Database } from '../src/lib/database.types.ts';
import {
  FREE_WORKOUTS,
  MAX_TRAINING_DAYS,
  PLAN_WORKOUT_EXERCISES,
  SESSION_MINUTES,
} from '../supabase/functions/_shared/plan/limits.ts';
import { usesTimeTarget } from '../supabase/functions/_shared/plan/prescription.ts';
import type { PlanInput, Session } from '../supabase/functions/_shared/plan/types.ts';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
// The local stack's fixed development key, as in .env.example.
const KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const PARALLEL_REQUESTS = 8;
// The local edge runtime turns a request away with 503 now and then while it is busy, which says
// nothing about the plan, so such a request is tried again a few times before it counts.
const BUSY_TRIES = 3;
const BUSY_WAIT_MS = 500;

// The enums are ordered: setups from the most equipment to the least, experience from beginner
// to advanced.
const {
  goal_kind: GOALS,
  experience: EXPERIENCES,
  training_setup: SETUPS,
} = Constants.public.Enums;
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

type Tables = Database['public']['Tables'];
type CatalogueRow = Tables['plan_slot_exercises']['Row'] & {
  exercises: Pick<Tables['exercises']['Row'], 'metrics'>;
};

async function signInAnonymously(): Promise<string> {
  const response = await fetch(`${URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!response.ok) {
    throw new Error(`Anonymous sign-in failed: ${response.status}`);
  }
  return ((await response.json()) as { access_token: string }).access_token;
}

async function loadCatalogue(token: string): Promise<CatalogueRow[]> {
  const response = await fetch(
    `${URL}/rest/v1/plan_slot_exercises?select=slot,exercise_id,requires,min_experience,exercises(metrics)`,
    { headers: { apikey: KEY, Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    throw new Error(`Could not load the catalogue: ${response.status}`);
  }
  return (await response.json()) as CatalogueRow[];
}

function allAnswers(): PlanInput[] {
  const answers: PlanInput[] = [];
  for (const goal of GOALS)
    for (const experience of EXPERIENCES)
      for (const setup of SETUPS)
        for (const sessionMinutes of SESSION_MINUTES)
          for (let days = 1; days <= MAX_TRAINING_DAYS; days++)
            answers.push({
              goal,
              experience,
              setup,
              sessionMinutes,
              trainingDays: WEEKDAYS.slice(0, days),
            });
  return answers;
}

/** Returns what is wrong with the plan for these answers, if anything. */
function problems(answers: PlanInput, sessions: Session[], catalogue: CatalogueRow[]): string[] {
  const found: string[] = [];
  const setupRank = SETUPS.indexOf(answers.setup);
  const experienceRank = EXPERIENCES.indexOf(answers.experience);

  const days = sessions.flatMap((session) => session.weekdays).sort((a, b) => a - b);
  if (days.join() !== [...answers.trainingDays].sort((a, b) => a - b).join()) {
    found.push(`sessions on days ${days.join()} for ${answers.trainingDays.join()}`);
  }
  if (sessions.length > FREE_WORKOUTS) {
    found.push(`${sessions.length} workouts`);
  }
  for (const session of sessions) {
    if (session.estimatedMinutes > answers.sessionMinutes) {
      found.push(`${session.type} takes ${session.estimatedMinutes} minutes`);
    }
    const count = session.exercises.length;
    if (session.exercises.length < 2 || count > PLAN_WORKOUT_EXERCISES) {
      found.push(`${session.type} has ${count} exercises`);
    }
    const conditioning = session.exercises.filter((exercise) => exercise.slot === 'conditioning');
    const endsWithConditioning = session.exercises.at(-1)?.slot === 'conditioning';
    if (conditioning.length > 1 || (answers.goal === 'lose_fat') !== endsWithConditioning) {
      found.push(`${session.type} has the wrong conditioning`);
    }
    const ids = session.exercises.map((exercise) => exercise.exerciseId);
    if (new Set(ids).size !== ids.length) {
      found.push(`${session.type} repeats an exercise`);
    }
    for (const exercise of session.exercises) {
      const row = catalogue.find(
        (entry) => entry.slot === exercise.slot && entry.exercise_id === exercise.exerciseId,
      );
      if (!row) {
        found.push(`${exercise.exerciseId} is not in the ${exercise.slot} slot`);
        continue;
      }
      if (SETUPS.indexOf(row.requires) < setupRank) {
        found.push(`${exercise.exerciseId} needs a ${row.requires}`);
      }
      if (EXPERIENCES.indexOf(row.min_experience) > experienceRank) {
        found.push(`${exercise.exerciseId} is for ${row.min_experience} users`);
      }
      if (usesTimeTarget(row.exercises.metrics) !== 'seconds' in exercise.target) {
        found.push(
          `${exercise.exerciseId} records ${row.exercises.metrics} but has another target`,
        );
      }
    }
  }
  return found;
}

const token = await signInAnonymously();
const catalogue = await loadCatalogue(token);
const queue = allAnswers();
const failures: string[] = [];
let checked = 0;

// Only signed-in users get a plan.
const unsigned = await fetch(`${URL}/functions/v1/generate-plan`, {
  method: 'POST',
  headers: { apikey: KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify(queue[0]),
});
if (unsigned.status !== 401) {
  failures.push(`without a session: HTTP ${unsigned.status}`);
}

async function requestPlan(answers: PlanInput): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`${URL}/functions/v1/generate-plan`, {
      method: 'POST',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(answers),
    });
    if (response.status !== 503 || attempt === BUSY_TRIES) {
      return response;
    }
    await new Promise((resolve) => setTimeout(resolve, BUSY_WAIT_MS * attempt));
  }
}

async function worker() {
  for (let answers = queue.shift(); answers !== undefined; answers = queue.shift()) {
    const response = await requestPlan(answers);
    const label = JSON.stringify(answers);
    if (!response.ok) {
      failures.push(`${label}: HTTP ${response.status}`);
      continue;
    }
    const { sessions } = (await response.json()) as { sessions: Session[] };
    for (const problem of problems(answers, sessions, catalogue)) {
      failures.push(`${label}: ${problem}`);
    }
    checked++;
  }
}

await Promise.all(Array.from({ length: PARALLEL_REQUESTS }, worker));

if (failures.length > 0) {
  console.error(failures.join('\n'));
  console.error(`${failures.length} problems in ${checked} plans`);
  process.exit(1);
}
console.log(`All ${checked} plans are valid`);
