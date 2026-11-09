import { useState } from 'react';

import { setWriteSince, useWritingWorkouts } from './connection';
import { requestHealthWriteAccess } from './health';

/** Why turning on saving workouts did not work. */
export type WritingProblem = 'denied' | 'failed';

/**
 * Saving finished workouts to the store (#479, ADR 0105): the switch, the sheet before the system
 * asks, and what went wrong. Turning it on saves the workouts finished from then on.
 */
export function useWorkoutWriting() {
  const writing = useWritingWorkouts();
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<WritingProblem | null>(null);
  const [busy, setBusy] = useState(false);

  /** Turning off stops at once; turning on first says what is written. */
  const toggle = (on: boolean) => {
    setProblem(null);
    if (on) setAsking(true);
    else setWriteSince(null);
  };

  /** Asks the system, once the user agreed, and starts saving when writing was allowed. */
  const allow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const allowed = await requestHealthWriteAccess();
      if (allowed) setWriteSince(new Date());
      setProblem(allowed ? null : 'denied');
    } catch (error) {
      console.warn('Could not ask to write workouts to the health store', error);
      setProblem('failed');
    } finally {
      setBusy(false);
      setAsking(false);
    }
  };

  const close = () => {
    if (!busy) setAsking(false);
  };

  return { writing, asking, problem, busy, toggle, allow, close };
}
