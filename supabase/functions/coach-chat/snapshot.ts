// The user's state as Bite sees it before each answer (#292): who they are, their goal, today's
// targets and food, their plan and streak, and the notes Bite keeps about them (ADR 0071). Read
// with the user's token, so row level security decides what Bite may see; what cannot be read is
// left out rather than failing the answer.
import type { NoteCategory } from '../_shared/coach/chat.ts';
import type { Database } from '../_shared/database.types.ts';
import { type Client, logError } from '../_shared/supabase.ts';
import { workoutName } from './workout.ts';

type GoalKind = Database['public']['Enums']['goal_kind'];

export type Macros = { kcal: number; proteinG: number; carbsG: number; fatG: number };

export type Snapshot = {
  /** The user's day, as their device has it. */
  date: string;
  weekday: string;
  /** The device's local time, HH:MM, when the app sent it. */
  time?: string;
  profile?: {
    name?: string;
    age: number;
    sex: string;
    heightCm: number;
    weightUnit: string;
    /** The least the targets ever ask for, which Bite never goes below. */
    calorieFloor?: number;
  };
  goal?: {
    kind: GoalKind;
    targetWeightKg?: number;
    weeklyPaceKg?: number;
    /**
     * The pace of loss the targets really give (ADR 0054), which the calorie floor can hold below
     * the chosen one, 0 when they keep the weight; unknown without a goal to lose, or while the
     * user's own targets are in use.
     */
    achievablePaceKg?: number;
  };
  /** The latest weight, in kg. */
  weightKg?: number;
  targets?: Macros;
  eaten?: Macros;
  training?: string;
  /** Today's workouts, and whether they are done; one without exercises yet says so (ADR 0064). */
  workouts?: string;
  streak?: string;
  /** Whether Bite saves notes from chats by itself, or asks first. */
  savesNotes?: boolean;
  /** The notes in use, which every answer reads; past notes and ones asked about are left out. */
  notes?: Note[];
};

export type Note = {
  id: number;
  category: NoteCategory;
  text: string;
  /** The day Bite asks again whether it still holds. */
  reviewOn?: string;
};

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Reads the user's snapshot on `today`, a date of their device, at `time` there. */
export async function loadSnapshot(
  supabase: Client,
  today: string,
  time?: string,
): Promise<Snapshot> {
  const day = { from_day: today, to_day: today, today };
  const [profile, goal, pace, weight, nutrition, planned, trained, streak, notes] =
    await Promise.all([
      supabase
        .from('profiles')
        .select(
          'display_name, birth_year, sex, height_cm, weight_unit, experience, training_setup, training_days, session_minutes, calorie_floor, coach_saves_notes',
        )
        .maybeSingle(),
      supabase.from('goals').select('kind, target_weight_kg, weekly_pace_kg').maybeSingle(),
      supabase.rpc('my_achievable_weekly_pace_kg'),
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
      supabase
        .from('coach_notes')
        .select('id, category, text, review_on')
        .is('archived_at', null)
        .eq('asked', false)
        .order('category')
        .order('id'),
    ]);
  const results = { profile, goal, pace, weight, nutrition, planned, trained, streak, notes };
  for (const [name, result] of Object.entries(results)) {
    if (result.error) logError(`Could not read the ${name} for the snapshot`, result.error);
  }

  const snapshot: Snapshot = {
    date: today,
    weekday: WEEKDAYS[(new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7],
    ...(time && { time }),
  };
  const p = profile.data;
  if (p) {
    snapshot.profile = {
      name: p.display_name ?? undefined,
      age: Number(today.slice(0, 4)) - p.birth_year,
      sex: p.sex,
      heightCm: p.height_cm,
      weightUnit: p.weight_unit,
      // The floor the targets keep to (calorie_floor()), which Bite never goes below.
      calorieFloor: p.calorie_floor ?? undefined,
    };
    snapshot.savesNotes = p.coach_saves_notes;
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
      kind: g.kind,
      targetWeightKg: g.target_weight_kg ?? undefined,
      weeklyPaceKg: g.weekly_pace_kg ?? undefined,
      achievablePaceKg: typeof pace.data === 'number' ? pace.data : undefined,
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
    // One whose empty alternative is in use (ADR 0064).
    const named = planned.data.map((workout) =>
      workout.exercise_count === 0
        ? `${workoutName(workout)} (no exercises yet)`
        : workoutName(workout),
    );
    snapshot.workouts = planned.data.length
      ? `${named.join(', ')} planned, ${done} done`
      : done
        ? `none planned, ${done} done`
        : 'rest day';
  }
  const s = streak.data?.[0];
  if (s) snapshot.streak = `${s.count} days, ${s.freezes} freezes left`;
  if (notes.data) {
    snapshot.notes = notes.data.map((note) => ({
      id: note.id,
      category: note.category,
      text: note.text,
      ...(note.review_on && { reviewOn: note.review_on }),
    }));
  }
  return snapshot;
}
