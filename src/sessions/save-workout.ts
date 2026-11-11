// Saving the workout in progress, which the phone's Save, a workout left open and a finish from the
// watch all do the same way; each keeps only what it does after.
import { useQueryClient } from '@tanstack/react-query';

import { afterWorkoutLogged } from '@/health/health-catch-up';
import type { WorkoutStats } from '@/health/types';
import { isDbError } from '@/lib/errors';
import { reloadPlan } from '@/workouts/workouts';

import { useLogWorkout } from './logs';
import { sessionRecords, type MetricsOf } from './records';
import {
  activeSession,
  endSession,
  setsToSave,
  stopClock,
  toLog,
  workoutIdOf,
  type Session,
} from './session';

/**
 * The saves running, by workout: shared by every caller, so that a workout saved from two places at
 * once, as a finish from the watch and the phone's Save, is saved once, with one end.
 */
const running = new Map<string, Promise<number | null>>();

type SaveOptions = {
  /** What the watch measured over it, kept with the log. */
  health?: WorkoutStats | null;
  /** Its exercises' metrics, by which its records are counted. */
  metricsOf?: MetricsOf;
};

/**
 * Saves the workout as ended at `endedAt`, with what the watch measured, and ends it with the records
 * it set, unless it was ended meanwhile; the log's id. A clock still running logs its set, as stopping it then
 * would. A workout without a set to save is not saved, which gives none. While a save of the
 * workout runs, another waits for it instead, ended as it was and with what it measured. A failed
 * save throws, and leaves the workout as it was.
 */
export function useSaveWorkout() {
  const { mutateAsync, isPending } = useLogWorkout();
  const queryClient = useQueryClient();

  const saveOnce = async (
    session: Session,
    endedAt: number,
    { health = null, metricsOf = () => undefined }: SaveOptions,
  ) => {
    // As it ends: a clock still running has logged its set.
    const ending = stopClock(session, endedAt);
    if (setsToSave(session, endedAt) === 0) return null;
    let logId: number;
    try {
      logId = await mutateAsync(toLog(ending, endedAt));
    } catch (error) {
      // The workout already waited for premium when this session started, as from a list cached
      // before the plan changed: the list is loaded again to show it locked.
      if (isDbError(error, 'waitsForPremium')) {
        void reloadPlan(queryClient);
      }
      throw error;
    }
    // What the watch measured goes with it, and it is saved to the health store (ADR 0105).
    void afterWorkoutLogged(queryClient, logId, health, {
      followedOnWatch: !!session.watchFollows,
    });
    const active = activeSession();
    if (active && workoutIdOf(active) === workoutIdOf(session)) {
      endSession({ saved: true, endedAt, records: sessionRecords(ending, metricsOf).length });
    }
    return logId;
  };

  const save = (session: Session, endedAt: number, options: SaveOptions = {}) => {
    const key = workoutIdOf(session);
    const saving = running.get(key);
    if (saving) return saving;
    const saved = saveOnce(session, endedAt, options).finally(() => running.delete(key));
    running.set(key, saved);
    return saved;
  };

  return { save, isPending };
}
