// The user's state as Bite sees it before each answer (#292): who they are, their goal, today's
// targets and food, their plan and streak. Read with the user's token, so row level security
// decides what Bite may see; what cannot be read is left out rather than failing the answer.
import { type Client, logError } from '../_shared/supabase.ts';

export type Macros = { kcal: number; proteinG: number; carbsG: number; fatG: number };

export type Snapshot = {
  /** The user's day, as their device has it. */
  date: string;
  weekday: string;
  profile?: {
    name?: string;
    age: number;
    sex: string;
    heightCm: number;
    weightUnit: string;
    pregnantOrBreastfeeding: boolean;
    /** The least the targets ever ask for, which Bite never goes below. */
    calorieFloor?: number;
  };
  goal?: { kind: string; targetWeightKg?: number; weeklyPaceKg?: number };
  /** The latest weight, in kg. */
  weightKg?: number;
  targets?: Macros;
  eaten?: Macros;
  training?: string;
  /** Today's workouts, and whether they are done. */
  workouts?: string;
  streak?: string;
};

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Reads the user's snapshot on `today`, a date of their device. */
export async function loadSnapshot(supabase: Client, today: string): Promise<Snapshot> {
  const day = { from_day: today, to_day: today, today };
  const [profile, goal, weight, nutrition, planned, trained, streak] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'display_name, birth_year, sex, height_cm, weight_unit, pregnant_or_breastfeeding, experience, training_setup, training_days, session_minutes, calorie_floor',
      )
      .maybeSingle(),
    supabase.from('goals').select('kind, target_weight_kg, weekly_pace_kg').maybeSingle(),
    supabase
      .from('weight_entries')
      .select('weight_kg')
      .order('measured_on', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.rpc('day_nutrition', day),
    supabase.rpc('planned_workouts', day),
    supabase.rpc('day_training', day),
    supabase.rpc('streak', { today }),
  ]);
  const results = { profile, goal, weight, nutrition, planned, trained, streak };
  for (const [name, result] of Object.entries(results)) {
    if (result.error) logError(`Could not read the ${name} for the snapshot`, result.error);
  }

  const snapshot: Snapshot = {
    date: today,
    weekday: WEEKDAYS[(new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7],
  };
  const p = profile.data;
  if (p) {
    snapshot.profile = {
      name: p.display_name ?? undefined,
      age: Number(today.slice(0, 4)) - p.birth_year,
      sex: p.sex,
      heightCm: p.height_cm,
      weightUnit: p.weight_unit,
      pregnantOrBreastfeeding: p.pregnant_or_breastfeeding,
      // The floor the targets keep to (calorie_floor()), which Bite never goes below.
      calorieFloor: p.calorie_floor ?? undefined,
    };
    snapshot.training = [
      p.experience,
      p.training_setup,
      `${p.training_days.map((d) => WEEKDAYS[d - 1].slice(0, 3)).join(', ')}`,
      `${p.session_minutes} min sessions`,
    ].join(' · ');
  }
  const g = goal.data;
  if (g) {
    snapshot.goal = {
      kind: g.kind.replaceAll('_', ' '),
      targetWeightKg: g.target_weight_kg ?? undefined,
      weeklyPaceKg: g.weekly_pace_kg ?? undefined,
    };
  }
  if (weight.data) snapshot.weightKg = weight.data.weight_kg;
  const n = nutrition.data?.[0];
  if (n) {
    snapshot.targets = {
      kcal: n.target_calories,
      proteinG: n.target_protein_g,
      carbsG: n.target_carbs_g,
      fatG: n.target_fat_g,
    };
    snapshot.eaten = { kcal: n.kcal, proteinG: n.protein_g, carbsG: n.carbs_g, fatG: n.fat_g };
  }
  if (planned.data) {
    const done = trained.data?.[0]?.done ?? 0;
    snapshot.workouts = planned.data.length
      ? `${planned.data.map((w) => w.name).join(', ')} planned, ${done} done`
      : done
        ? `none planned, ${done} done`
        : 'rest day';
  }
  const s = streak.data?.[0];
  if (s) snapshot.streak = `${s.count} days, ${s.freezes} freezes left`;
  return snapshot;
}
