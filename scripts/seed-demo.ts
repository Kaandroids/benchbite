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

const URL = 'http://127.0.0.1:54321';
// The local stack's fixed development key, as in .env.example.
const KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const DB_CONTAINER = 'supabase_db_benchbite';

const EMAIL = 'kaan.demo@benchbite.local';
const PASSWORD = 'benchbite-demo';
const HISTORY_DAYS = 44; // days before today; the plan starts then

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

function literal(value: string | number | null): string {
  if (value === null) return 'null';
  if (typeof value === 'number') return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}

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
const LOGGABLE_FROM = addDays(TODAY, -8); // check_log_day: today and the week before
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

/** SQL as the demo user in one transaction, as PostgREST runs a request. */
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

type PlanExercise = {
  exerciseId: string;
  slot: string;
  sets: number;
  target: { reps?: { min: number; max: number }; seconds?: number };
};
type Session = {
  type: 'upper' | 'lower';
  weekdays: number[];
  estimatedMinutes: number;
  exercises: PlanExercise[];
};

const answers = {
  displayName: 'Kaan',
  goal: 'lose_fat',
  consentedPolicyVersion: '2026-10-21',
  sex: 'male',
  birthYear: 1996,
  heightCm: 192,
  weightKg: 100,
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

const workouts = new Map(
  sql(`select id, type, weekdays from public.workouts where user_id = '${uid}'`).map(
    ([id, type, weekdays]) => [
      type as Session['type'],
      { id: Number(id), weekdays: weekdays!.slice(1, -1).split(',').map(Number) },
    ],
  ),
);
const sessions = new Map(plan.sessions.map((session) => [session.type, session]));

// ---------------------------------------------------------------------------------------------
// 3. The schedule: one Friday skipped and later frozen, two workouts moved within their week.

const planned = new Map<string, Session['type']>();
for (let day = START; day < TODAY; day = addDays(day, 1)) {
  for (const [type, workout] of workouts) {
    if (workout.weekdays.includes(isoWeekday(day))) planned.set(day, type);
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

function setsFor(exercise: PlanExercise, session: number): LoggedSet[] {
  const id = exercise.exerciseId;
  const { reps, seconds } = exercise.target;
  if (reps) {
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
  return [{ seconds: seconds ?? 600, meters }];
}

const sessionCount = { upper: 0, lower: 0 };

async function logWorkout(type: Session['type'], plannedOn: string, doneOn: string) {
  const session = sessions.get(type)!;
  const n = sessionCount[type]++;
  const exercises = session.exercises.map((exercise) => ({
    exerciseId: exercise.exerciseId,
    // Now and then the conditioning at the end is left out when time runs short.
    sets: exercise.slot === 'conditioning' && random() < 0.15 ? [] : setsFor(exercise, n),
  }));
  const hour = isoWeekday(doneOn) >= 6 ? 9 : 16;
  const startedAt = new Date(`${doneOn}T${String(hour).padStart(2, '0')}:00:00Z`);
  startedAt.setUTCMinutes(randint(5, 50));
  const minutes = session.estimatedMinutes + randint(-6, 7);
  await rpc('log_workout', {
    log: {
      clientId: crypto.randomUUID(),
      workoutId: workouts.get(type)!.id,
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

type Food = {
  food_id: string;
  name: string;
  kcal: number;
  protein_g: number;
  portion_unit: string;
  portions: Record<string, number>;
};
type Item = { name: string; grams: number; unit: string | null; count: number | null };
type Meals = Partial<Record<'breakfast' | 'lunch' | 'dinner' | 'snack', Item[]>>;

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

// Names of the foods the meals use, collected by building every meal once before they are loaded.
let wanted: Set<string> | null = null;

function item(name: string, count?: number, unit?: string): Item {
  if (wanted) {
    wanted.add(name);
    return { name, grams: 0, unit: null, count: null };
  }
  const f = food(name);
  const portionUnit = unit ?? f.portion_unit;
  return {
    name,
    grams: f.portions[portionUnit]! * (count ?? 1),
    unit: portionUnit,
    count: count ?? 1,
  };
}
function grams(name: string, amount: number): Item {
  wanted?.add(name);
  return { name, grams: amount, unit: null, count: null };
}
const kcal = (it: Item) => (it.grams * Number(food(it.name).kcal)) / 100;
const protein = (it: Item) => (it.grams * Number(food(it.name).protein_g)) / 100;
const total = (meals: Meals, value: (it: Item) => number) =>
  Object.values(meals)
    .flat()
    .reduce((sum, it) => sum + value(it), 0);

const BREAKFASTS = [
  () => [grams('Oat flakes', 70), item('Milk, 1.5% fat', 1, 'cup'), item('Banana'), item('Skyr')],
  () => [
    item('Scrambled eggs'),
    item('Wholemeal bread', 2),
    item('Cooked ham', 3),
    item('Coffee with milk'),
  ],
  () => [item('Low-fat quark'), item('Granola'), item('Blueberries')],
  () => [item('Porridge with milk'), item('Skyr'), item('Raspberries'), item('Coffee, black')],
  () => [
    item('Wholemeal roll', 2),
    item('Cream cheese'),
    item('Turkey breast cold cuts', 4),
    item('Egg, boiled', 2),
    item('Cappuccino'),
  ],
];
const LUNCHES = [
  () => [item('Chicken breast, grilled'), item('Brown rice, boiled'), item('Broccoli, boiled')],
  () => [item('Chicken wrap'), item('Mixed salad, no dressing')],
  () => [item('Tuna in water, canned'), item('Pasta, boiled'), item('Tomato sauce')],
  () => [item('Turkey breast, fried'), item('Potatoes, boiled'), item('Green beans, boiled')],
  () => [item('Chili con carne'), item('Bread roll')],
  () => [item('Chicken döner kebab'), item('Ayran')],
  () => [item('Red lentil soup'), item('Chicken breast, grilled'), item('Bulgur pilaf')],
];
const DINNERS = [
  () => [item('Salmon, fried'), item('Sweet potato, boiled'), item('Mixed salad with vinaigrette')],
  () => [
    grams('Lean beef mince, fried', 150),
    item('Wholemeal pasta, boiled'),
    item('Tomato sauce'),
  ],
  () => [
    item('Chicken breast, fried'),
    item('White rice, boiled'),
    item('Mixed vegetables, boiled'),
  ],
  () => [item('Beef steak, fried'), item('Jacket potato, baked'), item('Greek salad')],
  () => [
    item('Omelette'),
    item('Wholemeal bread', 2),
    item('Tomato'),
    grams('Cottage cheese', 100),
  ],
  () => [item('Gyros'), item('Rice pilaf'), item('Cucumber salad with yoghurt')],
  () => [item('Turkey schnitzel, breaded'), item('Mashed potatoes'), item('Peas, boiled')],
];
const WEEKEND_DINNERS = [
  () => [item('Pizza margherita')],
  () => [item('Cheeseburger'), item('French fries'), item('Cola light')],
  () => [item('Salmon sushi', 10), item('Soy sauce')],
];
const SNACKS = [
  () => [item('Skyr')],
  () => [item('Apple')],
  () => [item('Banana')],
  () => [item('Almonds')],
  () => [item('Cottage cheese')],
  () => [item('Rice cakes', 3), item('Peanut butter')],
  () => [item('Latte macchiato')],
  () => [item('Kefir, 3.5% fat')],
  () => [item('Muesli bar')],
  () => [grams('Dark chocolate', 20)],
  () => [grams('Low-fat quark', 200), item('Strawberries')],
];
const PROTEIN_SNACKS = [0, 4, 7, 10];
const OVER_DINNER = () => [
  item('Pizza salami'),
  item('Beer, pilsner', 2),
  item('Chocolate ice cream'),
];
const TODAY_MEALS = (): Meals => ({
  breakfast: BREAKFASTS[0]!(),
  lunch: LUNCHES[0]!(),
  snack: [item('Latte macchiato')],
});

/** Meals for a day, a little under the calorie target unless it is the day over it. */
function planDay(targetKcal: number, targetProtein: number, day: string, over: boolean): Meals {
  const weekend = isoWeekday(day) >= 6;
  for (let attempt = 0; attempt < 200; attempt++) {
    const meals: Meals = {
      breakfast: choice(BREAKFASTS)(),
      lunch: choice(LUNCHES)(),
      dinner: choice(weekend && random() < 0.6 ? WEEKEND_DINNERS : DINNERS)(),
      snack: [],
    };
    if (over)
      return { ...meals, dinner: OVER_DINNER(), snack: [...choice(SNACKS)(), item('Crisps')] };
    // Snacks until the day is near its goal, protein first when it lags.
    const goal = targetKcal * uniform(0.86, 0.97);
    let order = shuffle(SNACKS.map((_, i) => i));
    if (total(meals, protein) < targetProtein - 20) {
      order = [...PROTEIN_SNACKS, ...order.filter((i) => !PROTEIN_SNACKS.includes(i))];
    }
    for (const i of order) {
      const extra = SNACKS[i]!();
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

// The foods are looked up once, before the meals are built from them.
wanted = new Set(['Crisps']);
for (const meals of [BREAKFASTS, LUNCHES, DINNERS, WEEKEND_DINNERS, SNACKS, [OVER_DINNER]]) {
  for (const meal of meals) meal();
}
const names = wanted;
wanted = null;
for (const name of names) await loadFood(name);

// ---------------------------------------------------------------------------------------------
// 6. Weights every 2 to 4 days, from 100 kg down to 96.1 kg today.

const weights = new Map<string, number>([[START, 100]]);
for (
  let day = addDays(START, choice([2, 3, 3, 4]));
  day <= TODAY;
  day = addDays(day, choice([2, 3, 3, 4]))
) {
  const trend = 100 - 3.9 * (daysBetween(START, day) / HISTORY_DAYS) ** 0.8;
  weights.set(day, Math.round((trend + gauss(0.25)) * 10) / 10);
}
weights.set(TODAY, 96.1);

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
    // Breakfast, lunch and a coffee: the ring is a bit over half full.
    meals = TODAY_MEALS();
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
// the app's popup back then, so its kept day is frozen and one freeze is spent.

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
