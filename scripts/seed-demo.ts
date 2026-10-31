// Deletes and recreates the demo account of the local Supabase stack, whose screens are the
// README's screenshots (docs/media/README.md). Run with `pnpm seed:demo` while the stack and the
// Edge Functions are running, on the day the screenshots are taken: the history ends today.
//
// Only kaan.demo@benchbite.local is touched. Data goes in the app's way where the server allows:
// sign-up, generate-plan, complete_onboarding, log_workout and the logging of the last week as
// the user over REST. What the server only accepts near today (older weights, meals and water)
// is inserted as the user in SQL, with the day checks off inside that transaction only, and the
// onboarding is backdated as postgres.
import { execFileSync } from 'node:child_process';

import type { Database } from '../src/lib/database.types.ts';
import type {
  PlannedExercise,
  Session,
  SessionType,
} from '../supabase/functions/_shared/plan/types.ts';
import { KEY, URL, isLocal } from './lib/local-stack.ts';
import { sqlString } from './lib/migration.ts';

if (!isLocal) throw new Error(`The demo account is only made on a local stack, not ${URL}.`);
const DB_CONTAINER = 'supabase_db_benchbite';

const EMAIL = 'kaan.demo@benchbite.local';
const PASSWORD = 'benchbite-demo';
const HISTORY_DAYS = 44; // days before today; the plan starts then
const START_WEIGHT = 100;
const END_WEIGHT = 96.1; // today's, 3.9 kg down

// A seeded generator, so that every run tells the same story.
let state = 20261031;
function random(): number {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randint = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const uniform = (min: number, max: number) => min + random() * (max - min);
const gauss = (sd: number) =>
  sd * Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
function choice<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}
function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

// Days as YYYY-MM-DD, counted in UTC.
const addDays = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const isoWeekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay() || 7;

// ---------------------------------------------------------------------------------------------
// SQL in the local container and REST as the demo user.

function sql(query: string): string[][] {
  const out = execFileSync(
    'docker',
    ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-tA'],
    { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] },
  );
  return out
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => line.split('|'));
}

const literal = (value: string | number | null) =>
  typeof value === 'number' ? String(value) : sqlString(value);

let token = '';
async function request<T = unknown>(method: string, path: string, body?: unknown, prefer?: string) {
  const response = await fetch(URL + path, {
    method,
    headers: {
      apikey: KEY,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 500)}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}
const rpc = <T = unknown>(name: string, args: unknown) =>
  request<T>('POST', `/rest/v1/rpc/${name}`, args);

const TODAY = sql('select current_date')[0]![0]!;
const START = addDays(TODAY, -HISTORY_DAYS);
// is_loggable_day() (20261031200100_food_log_proposals.sql): today and the week before.
const LOGGABLE_FROM = addDays(TODAY, -8);
const OVER_DAY = addDays(TODAY, -40); // ate over the target: the streak starts after it

// ---------------------------------------------------------------------------------------------
// 1. Delete the demo user and sign up again; Bite needs a monthly budget to answer.

sql(`delete from auth.users where email = ${literal(EMAIL)}`);
const signUp = await request<{ access_token: string; user: { id: string } }>(
  'POST',
  '/auth/v1/signup',
  { email: EMAIL, password: PASSWORD },
);
token = signUp.access_token;
const uid = signUp.user.id;
sql(`insert into public.ai_budgets (user_id, monthly_limit_usd) values ('${uid}', 4)`);
console.log(`Signed up ${EMAIL}; today ${TODAY}, the plan starts ${START}.`);

/**
 * SQL as the demo user in one transaction, as PostgREST runs a request. `disableDayChecks` turns
 * off, inside it only, the check_log_day() triggers of meal_entries
 * (20261027160000_create_meal_entries.sql) and water_days (20261027210000_water.sql).
 */
function asUser(body: string, disableDayChecks = false): string[][] {
  const triggers = (action: string) =>
    disableDayChecks
      ? `alter table public.meal_entries ${action} trigger meal_entries_check_meal_day;
         alter table public.water_days ${action} trigger water_days_check_day;\n`
      : '';
  const claims = literal(JSON.stringify({ sub: uid, role: 'authenticated' }));
  return sql(`begin;
${triggers('disable')}set local role authenticated;
select set_config('request.jwt.claims', ${claims}, true) \\g /dev/null
${body}
reset role;
${triggers('enable')}commit;
`);
}

// ---------------------------------------------------------------------------------------------
// 2. The onboarding as the app does it, then backdated to START.

const answers = {
  displayName: 'Kaan',
  goal: 'lose_fat',
  consentedPolicyVersion: '2026-10-21',
  sex: 'male',
  birthYear: 1996,
  heightCm: 192,
  weightKg: START_WEIGHT,
  targetWeightKg: 90,
  weeklyPaceKg: 0.5,
  activityLevel: 'sedentary',
  experience: 'intermediate',
  trainingDays: [1, 2, 4, 5],
  trainingDaysChosen: false,
  setup: 'gym',
  sessionMinutes: 60,
  weightUnit: 'kg',
  heightUnit: 'cm',
};
const plan = await request<{ sessions: Session[] }>('POST', '/functions/v1/generate-plan', {
  goal: answers.goal,
  experience: answers.experience,
  trainingDays: answers.trainingDays,
  setup: answers.setup,
  sessionMinutes: answers.sessionMinutes,
});
await rpc('complete_onboarding', { answers: { ...answers, today: TODAY }, plan });

// Triggers are skipped (replica), so that updated_at keeps the backdated time.
const startTs = literal(`${START} 07:40:00+00`);
sql(`begin;
set local session_replication_role = replica;
update auth.users set created_at = ${startTs}, updated_at = ${startTs},
  email_confirmed_at = ${startTs}, last_sign_in_at = now() where id = '${uid}';
update public.profiles set created_at = ${startTs}, updated_at = ${startTs},
  onboarding_completed_at = ${startTs} where user_id = '${uid}';
update public.goals set created_at = ${startTs}, updated_at = ${startTs} where user_id = '${uid}';
update public.health_data_consents set granted_at = ${startTs} where user_id = '${uid}';
update public.workouts set created_at = ${startTs} where user_id = '${uid}';
update public.weight_entries set measured_on = '${START}', created_at = ${startTs}
  where user_id = '${uid}';
delete from public.planned_days where user_id = '${uid}';
update public.planned_days_kept set started_on = '${START}', through = '${addDays(START, -1)}'
  where user_id = '${uid}';
-- The streak was first read on the day the plan started (ADR 0044).
insert into public.user_streaks (user_id, answered_through)
  values ('${uid}', '${addDays(START, -1)}');
commit;`);
// The app keeps the planned days on opening; this keeps every day from START to yesterday.
await rpc('keep_planned_days', { today: TODAY });

const workoutIds = new Map(
  sql(`select type, id from public.workouts where user_id = '${uid}'`).map(([type, id]) => [
    type as SessionType,
    Number(id),
  ]),
);
const sessions = new Map(plan.sessions.map((session) => [session.type, session]));

// ---------------------------------------------------------------------------------------------
// 3. The schedule: one Friday skipped and later frozen, two workouts moved within their week.

// Today included: on a training day, today's workout is done in the morning.
const planned = new Map<string, SessionType>();
for (let day = START; day <= TODAY; day = addDays(day, 1)) {
  for (const session of plan.sessions) {
    if (session.weekdays.includes(isoWeekday(day))) planned.set(day, session.type);
  }
}
const plannedDays = [...planned.keys()].sort();
const fridays = plannedDays.filter(
  (day) => isoWeekday(day) === 5 && day > addDays(OVER_DAY, 7) && day <= addDays(TODAY, -10),
);
const FROZEN_DAY = fridays[Math.floor(fridays.length / 2)]!;
const MOVES = new Map<string, string>(); // planned day -> the day it was done
const tuesday = plannedDays.find((day) => isoWeekday(day) === 2 && day > FROZEN_DAY)!;
MOVES.set(tuesday, addDays(tuesday, 1));
const lateFriday = plannedDays.find(
  (day) => isoWeekday(day) === 5 && day > addDays(FROZEN_DAY, 7) && day < addDays(TODAY, -2),
)!;
MOVES.set(lateFriday, addDays(lateFriday, 1));

// ---------------------------------------------------------------------------------------------
// 4. Workouts with double progression in the plan's rep ranges.

// Starting weight and step per exercise of the intermediate gym plan.
const START_WEIGHTS: Record<string, [number, number]> = {
  'Barbell_Bench_Press_-_Medium_Grip': [72.5, 2.5],
  Bent_Over_Barbell_Row: [60, 2.5],
  Standing_Military_Press: [40, 2.5],
  'Wide-Grip_Lat_Pulldown': [59, 4.5],
  'Barbell_Incline_Bench_Press_-_Medium_Grip': [50, 2.5],
  Barbell_Curl: [30, 2.5],
  Triceps_Pushdown: [25, 2.5],
  Barbell_Squat: [90, 5],
  Romanian_Deadlift: [80, 5],
  Barbell_Lunge: [30, 2.5],
  Standing_Calf_Raises: [80, 5],
  Leg_Press: [140, 10],
};
const progress = new Map<string, { weight: number; reps: number }>();

type LoggedSet = { weightKg?: number; reps?: number; seconds?: number; meters?: number };

function setsFor(exercise: PlannedExercise, session: number): LoggedSet[] {
  const id = exercise.exerciseId;
  const { target } = exercise;
  if ('reps' in target) {
    const { reps } = target;
    const [startWeight, step] = START_WEIGHTS[id] ?? [20, 2.5];
    const now = progress.get(id) ?? { weight: startWeight, reps: reps.min + 1 };
    progress.set(id, now);
    const sets = Array.from({ length: exercise.sets }, (_, i) => ({
      weightKg: now.weight,
      reps: Math.max(reps.min - 1, now.reps - (i === 0 ? 0 : i < 3 ? choice([0, 1, 1, 2]) : 2)),
    }));
    // Next time one more rep, usually; at the top of the range, more weight.
    if (now.reps >= reps.max) {
      now.weight = Math.round((now.weight + step) * 100) / 100;
      now.reps = reps.min;
    } else {
      now.reps = Math.min(reps.max, now.reps + choice([1, 1, 1, 0, 2]));
    }
    return sets;
  }
  if (id === 'Plank') {
    return Array.from({ length: exercise.sets }, (_, i) => ({
      seconds: 45 + 3 * session - 5 * i + choice([0, 5]),
    }));
  }
  // Conditioning: duration and distance.
  const meters =
    id === 'Rowing_Stationary'
      ? 2050 + 15 * session + randint(-40, 40)
      : 4300 + 40 * session + randint(-100, 100);
  return [{ seconds: 'seconds' in target ? target.seconds : 600, meters }];
}

const sessionCount: Partial<Record<SessionType, number>> = {};

async function logWorkout(type: SessionType, plannedOn: string, doneOn: string) {
  const session: Session = sessions.get(type)!;
  const n = sessionCount[type] ?? 0;
  sessionCount[type] = n + 1;
  const exercises = session.exercises.map((exercise) => ({
    exerciseId: exercise.exerciseId,
    // Now and then the conditioning at the end is left out when time runs short.
    sets: exercise.slot === 'conditioning' && random() < 0.15 ? [] : setsFor(exercise, n),
  }));
  // After work on weekdays, in the morning at weekends and today, as it has to be over by now.
  const hour = doneOn === TODAY ? 6 : isoWeekday(doneOn) >= 6 ? 9 : 16;
  const startedAt = new Date(`${doneOn}T${String(hour).padStart(2, '0')}:00:00Z`);
  startedAt.setUTCMinutes(randint(5, 50));
  const minutes = session.estimatedMinutes + randint(-6, 7);
  if (startedAt.getTime() + minutes * 60_000 > Date.now()) {
    throw new Error("Today's workout would end in the future; run the seed later in the day.");
  }
  await rpc('log_workout', {
    log: {
      clientId: crypto.randomUUID(),
      workoutId: workoutIds.get(type)!,
      plannedExercises: session.exercises.length,
      plannedSets: session.exercises.reduce((sum, exercise) => sum + exercise.sets, 0),
      startedAt: startedAt.toISOString(),
      startedOn: doneOn,
      finishedAt: new Date(startedAt.getTime() + minutes * 60_000).toISOString(),
      exercises,
      ...(plannedOn !== doneOn ? { move: { from: plannedOn, to: doneOn } } : {}),
    },
  });
}

// ---------------------------------------------------------------------------------------------
// 5. Meals from the food library, found with search_foods as the app does.

type Food = Database['public']['Functions']['search_foods']['Returns'][number] & {
  portions: Record<string, number>;
};
/** A food of a meal: a number of its portions (one by default), or grams. */
type Portion = { name: string; count?: number; unit?: string; grams?: number };
type Item = { name: string; grams: number; unit: string | null; count: number | null };
type Meals = Partial<Record<'breakfast' | 'lunch' | 'dinner' | 'snack', Item[]>>;

const BREAKFASTS: Portion[][] = [
  [
    { name: 'Oat flakes', grams: 70 },
    { name: 'Milk, 1.5% fat', unit: 'cup' },
    { name: 'Banana' },
    { name: 'Skyr' },
  ],
  [
    { name: 'Scrambled eggs' },
    { name: 'Wholemeal bread', count: 2 },
    { name: 'Cooked ham', count: 3 },
    { name: 'Coffee with milk' },
  ],
  [{ name: 'Low-fat quark' }, { name: 'Granola' }, { name: 'Blueberries' }],
  [
    { name: 'Porridge with milk' },
    { name: 'Skyr' },
    { name: 'Raspberries' },
    { name: 'Coffee, black' },
  ],
  [
    { name: 'Wholemeal roll', count: 2 },
    { name: 'Cream cheese' },
    { name: 'Turkey breast cold cuts', count: 4 },
    { name: 'Egg, boiled', count: 2 },
    { name: 'Cappuccino' },
  ],
];
const LUNCHES: Portion[][] = [
  [
    { name: 'Chicken breast, grilled' },
    { name: 'Brown rice, boiled' },
    { name: 'Broccoli, boiled' },
  ],
  [{ name: 'Chicken wrap' }, { name: 'Mixed salad, no dressing' }],
  [{ name: 'Tuna in water, canned' }, { name: 'Pasta, boiled' }, { name: 'Tomato sauce' }],
  [{ name: 'Turkey breast, fried' }, { name: 'Potatoes, boiled' }, { name: 'Green beans, boiled' }],
  [{ name: 'Chili con carne' }, { name: 'Bread roll' }],
  [{ name: 'Chicken döner kebab' }, { name: 'Ayran' }],
  [{ name: 'Red lentil soup' }, { name: 'Chicken breast, grilled' }, { name: 'Bulgur pilaf' }],
];
const DINNERS: Portion[][] = [
  [
    { name: 'Salmon, fried' },
    { name: 'Sweet potato, boiled' },
    { name: 'Mixed salad with vinaigrette' },
  ],
  [
    { name: 'Lean beef mince, fried', grams: 150 },
    { name: 'Wholemeal pasta, boiled' },
    { name: 'Tomato sauce' },
  ],
  [
    { name: 'Chicken breast, fried' },
    { name: 'White rice, boiled' },
    { name: 'Mixed vegetables, boiled' },
  ],
  [{ name: 'Beef steak, fried' }, { name: 'Jacket potato, baked' }, { name: 'Greek salad' }],
  [
    { name: 'Omelette' },
    { name: 'Wholemeal bread', count: 2 },
    { name: 'Tomato' },
    { name: 'Cottage cheese', grams: 100 },
  ],
  [{ name: 'Gyros' }, { name: 'Rice pilaf' }, { name: 'Cucumber salad with yoghurt' }],
  [{ name: 'Turkey schnitzel, breaded' }, { name: 'Mashed potatoes' }, { name: 'Peas, boiled' }],
];
const WEEKEND_DINNERS: Portion[][] = [
  [{ name: 'Pizza margherita' }],
  [{ name: 'Cheeseburger' }, { name: 'French fries' }, { name: 'Cola light' }],
  [{ name: 'Salmon sushi', count: 10 }, { name: 'Soy sauce' }],
];
const SNACKS: Portion[][] = [
  [{ name: 'Skyr' }],
  [{ name: 'Apple' }],
  [{ name: 'Banana' }],
  [{ name: 'Almonds' }],
  [{ name: 'Cottage cheese' }],
  [{ name: 'Rice cakes', count: 3 }, { name: 'Peanut butter' }],
  [{ name: 'Latte macchiato' }],
  [{ name: 'Kefir, 3.5% fat' }],
  [{ name: 'Muesli bar' }],
  [{ name: 'Dark chocolate', grams: 20 }],
  [{ name: 'Low-fat quark', grams: 200 }, { name: 'Strawberries' }],
];
const PROTEIN_SNACKS = [0, 4, 7, 10];
const OVER_DINNER: Portion[] = [
  { name: 'Pizza salami' },
  { name: 'Beer, pilsner', count: 2 },
  { name: 'Chocolate ice cream' },
];
const OVER_SNACK: Portion = { name: 'Crisps' };
// Breakfast, lunch and a coffee: today's ring is a bit over half full.
const TODAY_MEALS = {
  breakfast: BREAKFASTS[0]!,
  lunch: LUNCHES[0]!,
  snack: [{ name: 'Latte macchiato' }],
};

const foods = new Map<string, Food>();
async function loadFood(name: string): Promise<void> {
  if (foods.has(name)) return;
  const rows = await rpc<Food[]>('search_foods', { query: name, language: 'en', recipes: false });
  const hit = rows.find((row) => row.name === name && row.food_id);
  if (!hit) throw new Error(`Food not found: ${name}`);
  const portions = await request<{ unit: string; grams: number }[]>(
    'GET',
    `/rest/v1/food_portions?food_id=eq.${hit.food_id}&select=unit,grams`,
  );
  hit.portions = Object.fromEntries(portions.map((p) => [p.unit, Number(p.grams)]));
  foods.set(name, hit);
}
const food = (name: string) => foods.get(name)!;

// Every food the meals use is looked up once, before any meal is built.
for (const portion of [
  ...[BREAKFASTS, LUNCHES, DINNERS, WEEKEND_DINNERS, SNACKS].flat(2),
  ...OVER_DINNER,
  OVER_SNACK,
]) {
  await loadFood(portion.name);
}

/** The items of a meal, new each time, as planDay() changes their grams. */
function items(portions: Portion[]): Item[] {
  return portions.map(({ name, count, unit, grams }) => {
    if (grams !== undefined) return { name, grams, unit: null, count: null };
    const portionUnit = unit ?? food(name).portion_unit;
    return {
      name,
      grams: food(name).portions[portionUnit]! * (count ?? 1),
      unit: portionUnit,
      count: count ?? 1,
    };
  });
}
const kcal = (it: Item) => (it.grams * Number(food(it.name).kcal)) / 100;
const protein = (it: Item) => (it.grams * Number(food(it.name).protein_g)) / 100;
const total = (meals: Meals, value: (it: Item) => number) =>
  Object.values(meals)
    .flat()
    .reduce((sum, it) => sum + value(it), 0);

/** Meals for a day, a little under the calorie target unless it is the day over it. */
function planDay(targetKcal: number, targetProtein: number, day: string, over: boolean): Meals {
  const weekend = isoWeekday(day) >= 6;
  for (let attempt = 0; attempt < 200; attempt++) {
    const meals: Meals = {
      breakfast: items(choice(BREAKFASTS)),
      lunch: items(choice(LUNCHES)),
      dinner: items(choice(weekend && random() < 0.6 ? WEEKEND_DINNERS : DINNERS)),
      snack: [],
    };
    if (over)
      return {
        ...meals,
        dinner: items(OVER_DINNER),
        snack: items([...choice(SNACKS), OVER_SNACK]),
      };
    // Snacks until the day is near its goal, protein first when it lags.
    const goal = targetKcal * uniform(0.86, 0.97);
    let order = shuffle(SNACKS.map((_, i) => i));
    if (total(meals, protein) < targetProtein - 20) {
      order = [...PROTEIN_SNACKS, ...order.filter((i) => !PROTEIN_SNACKS.includes(i))];
    }
    for (const i of order) {
      const extra = items(SNACKS[i]!);
      if (total(meals, kcal) + extra.reduce((sum, it) => sum + kcal(it), 0) <= goal) {
        meals.snack!.push(...extra);
      }
    }
    // A remaining gap is filled with more of the dinner's and the lunch's sides.
    const gap = goal - total(meals, kcal);
    if (gap > 80) {
      for (const meal of ['dinner', 'lunch'] as const) {
        const items = meals[meal]!;
        const it = items[Math.max(items.length - 2, 0)]!;
        const perGram = Number(food(it.name).kcal) / 100;
        it.grams = Math.round(it.grams + Math.min(gap, 250) / perGram / 2);
        it.unit = it.count = null;
      }
    }
    const k = total(meals, kcal);
    if (k >= targetKcal * 0.84 && k <= targetKcal * 0.985) return meals;
  }
  throw new Error(`Could not plan the meals of ${day}`);
}

function waterAmounts(): number[] {
  let left = choice([1500, 1750, 2000, 2000, 2250, 2500, 2500, 2750, 3000]);
  const amounts = [];
  while (left > 0) {
    const amount = Math.min(left, choice([250, 250, 330, 500, 500]));
    amounts.push(amount);
    left -= amount;
  }
  return amounts;
}

// ---------------------------------------------------------------------------------------------
// 6. Weights every 2 to 4 days, from START_WEIGHT down to END_WEIGHT today.

const weights = new Map<string, number>([[START, START_WEIGHT]]);
for (
  let day = addDays(START, choice([2, 3, 3, 4]));
  day <= TODAY;
  day = addDays(day, choice([2, 3, 3, 4]))
) {
  const trend =
    START_WEIGHT - (START_WEIGHT - END_WEIGHT) * (daysBetween(START, day) / HISTORY_DAYS) ** 0.8;
  weights.set(day, Math.round((trend + gauss(0.25)) * 10) / 10);
}
weights.set(TODAY, END_WEIGHT);

// ---------------------------------------------------------------------------------------------
// 7. Day by day, in order, so that each day keeps the targets and the weight it had then.

let entryCount = 0;
let workoutCount = 0;
for (let day = START; day <= TODAY; day = addDays(day, 1)) {
  const isToday = day === TODAY;
  // The weight comes first: it is measured in the morning and sets the day's targets.
  const weight = weights.get(day);
  if (weight !== undefined && isToday) {
    await rpc('log_weight', { weight_kg: weight, today: day });
  } else if (weight !== undefined && day !== START) {
    asUser(`insert into public.weight_entries (user_id, weight_kg, measured_on)
      values ('${uid}', ${weight}, '${day}');`);
  }
  const [targetKcal, targetProtein] = asUser(
    'select (t).calories, (t).protein_g from (select public.my_nutrition_targets() t) x;',
  )[0]!.map(Number);

  let meals = planDay(targetKcal!, targetProtein!, day, day === OVER_DAY);
  if (isToday) {
    meals = {
      breakfast: items(TODAY_MEALS.breakfast),
      lunch: items(TODAY_MEALS.lunch),
      snack: items(TODAY_MEALS.snack),
    };
  } else if (day !== OVER_DAY && random() < 0.12) {
    // Some days only part was logged.
    meals = { ...meals, snack: [] };
  }
  const rows = Object.entries(meals).flatMap(([meal, items]) =>
    items.map((it) => ({
      day,
      meal,
      food_id: food(it.name).food_id,
      grams: it.grams,
      portion_unit: it.unit,
      portion_count: it.count,
    })),
  );
  const water = isToday ? [500, 250, 500] : waterAmounts();

  if (day >= LOGGABLE_FROM) {
    await request('POST', '/rest/v1/meal_entries', rows, 'return=minimal');
    for (const ml of water) await rpc('add_water', { on_day: day, amount_ml: ml });
  } else {
    const values = rows
      .map(
        (r) =>
          `(${literal(r.day)}, ${literal(r.meal)}, ${literal(r.food_id)}, ${r.grams}, ` +
          `${literal(r.portion_unit)}::public.portion_unit, ${literal(r.portion_count)})`,
      )
      .join(',\n');
    const waterSql = water
      .map((ml) => `select public.add_water('${day}', ${ml}) \\g /dev/null`)
      .join('\n');
    asUser(
      `insert into public.meal_entries (day, meal, food_id, grams, portion_unit, portion_count)
      values ${values};\n${waterSql}`,
      true,
    );
  }
  entryCount += rows.length;

  // The day's workout: done as planned, moved to the next day, or skipped.
  const type = planned.get(day);
  if (type && day !== FROZEN_DAY && !MOVES.has(day)) {
    await logWorkout(type, day, day);
    workoutCount++;
  }
  for (const [from, to] of MOVES) {
    if (to === day) {
      await logWorkout(planned.get(from)!, from, to);
      workoutCount++;
    }
  }
}

// Entries, weights and moves get the time of day they would have had.
sql(`update public.meal_entries set created_at = (day + case meal
    when 'breakfast' then time '06:45' when 'lunch' then time '11:10'
    when 'dinner' then time '17:20' else time '14:30' end
    + (id % 37) * interval '1 minute') at time zone 'UTC'
  where user_id = '${uid}' and day < current_date;
update public.weight_entries set created_at = (measured_on + time '05:30') at time zone 'UTC'
  where user_id = '${uid}' and measured_on < current_date;
update public.workout_moves m set created_at = (m.to_on + time '08:00') at time zone 'UTC'
  where m.user_id = '${uid}';`);

// ---------------------------------------------------------------------------------------------
// 8. The streak as the app reads it (ADR 0045). The skipped Friday was answered with a freeze in
// the app's popup back then, so its kept day is frozen and one freeze is spent, as
// answer_streak_break() (20261029130000_streak_break_days.sql) does. That function checks that its
// today is the device's (assert_device_today), so it cannot be called as of a day weeks back.

await rpc('streak', { today: TODAY });
sql(`begin;
update public.streak_days set result = 'frozen'
  where user_id = '${uid}' and day = '${FROZEN_DAY}' and result = 'missed';
update public.user_streaks set freezes = freezes - 1,
  answered_through = greatest(answered_through, '${FROZEN_DAY}')
  where user_id = '${uid}';
commit;`);
const streak = await rpc<{ current: number }>('streak', { today: TODAY });
console.log(
  `Logged ${daysBetween(START, TODAY) + 1} days, ${entryCount} meal entries and ` +
    `${workoutCount} workouts; the streak is ${JSON.stringify(streak)}.`,
);
