import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { TRAINING_DAYS_KEY } from '@/history/history';
import { toIsoDate } from '@/i18n/dates';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

/** How the user trained on a day (day_training()). */
export type DayTraining = {
  /** YYYY-MM-DD. */
  day: string;
  /** In the workouts started on the day. */
  minutes: number;
  liftedKg: number;
  /** The planned workouts done and missed, as the streak counts them (ADR 0044). */
  done: number;
  missed: number;
};

/** Days of training added up. */
export type TrainingSummary = {
  /** The days with a workout. */
  days: number;
  /** The planned workouts done, and those done or missed. */
  done: number;
  planned: number;
  minutes: number;
  liftedKg: number;
};

export function trainingSummary(days: readonly DayTraining[]): TrainingSummary {
  return days.reduce<TrainingSummary>(
    (sum, day) => ({
      days: sum.days + (day.minutes > 0 ? 1 : 0),
      done: sum.done + day.done,
      planned: sum.planned + day.done + day.missed,
      minutes: sum.minutes + day.minutes,
      liftedKg: sum.liftedKg + day.liftedKg,
    }),
    { days: 0, done: 0, planned: 0, minutes: 0, liftedKg: 0 },
  );
}

/** From how many minutes of a day each shade of the heat map stands for, lightest first. */
export const HEAT_MINUTES = [1, 30, 60, 90] as const;

/** A day's shade in the heat map: 0 without a workout, then 1 to 4 by the minutes trained. */
export function heatLevel(minutes: number): number {
  return HEAT_MINUTES.filter((from) => minutes >= from).length;
}

/**
 * How the user trained on each day from `from` to `to`, at most a year, as seen on the device's
 * `today` (ADR 0047). A chart whose range changes keeps the last days until the new ones load.
 */
export function useDayTraining(
  today: Date,
  from: Date,
  to: Date,
  { keepLast = false }: { keepLast?: boolean } = {},
) {
  const fromDay = toIsoDate(from);
  const toDay = toIsoDate(to);
  return useQuery({
    queryKey: [...TRAINING_DAYS_KEY, fromDay, toDay],
    placeholderData: keepLast ? keepPreviousData : undefined,
    queryFn: async (): Promise<DayTraining[]> => {
      const { data, error } = await supabase.rpc('day_training', {
        from_day: fromDay,
        to_day: toDay,
        today: toIsoDate(today),
      });
      if (error) {
        throw error;
      }
      return data.map(dayTrainingOf);
    },
  });
}

type DayTrainingRow = Database['public']['Functions']['day_training']['Returns'][number];

function dayTrainingOf(row: DayTrainingRow): DayTraining {
  return {
    day: row.day,
    minutes: row.minutes,
    liftedKg: row.lifted_kg,
    done: row.done,
    missed: row.missed,
  };
}
