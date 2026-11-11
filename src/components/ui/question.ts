// A question asked in a sheet over every screen, such as at the start of a workout: `ask` opens it
// and resolves with the answer, which the sheet gives through `useQuestion`.
import { useEffect, useSyncExternalStore } from 'react';

import { createListeners } from '@/lib/listeners';

import { whenSheetClosed } from './sheet';

type Pending<Q, A> = { question: Q; answer: (value: A) => void; shown: boolean };

/**
 * A question whose answer is `cancelled` when it is left open: by a new one, or by its sheet going,
 * as on signing out.
 */
export function createQuestion<Q, A>(cancelled: A) {
  let pending: Pending<Q, A> | null = null;
  const listeners = createListeners();

  function setPending(value: Pending<Q, A> | null) {
    pending = value;
    listeners.notify();
  }

  const shown = () => (pending?.shown ? pending : null);

  /** Answers the question still open, if any, with `cancelled`. */
  function cancel() {
    pending?.answer(cancelled);
  }

  return {
    /**
     * Asks `question`, once a sheet that just closed has closed, as iOS would not show the next
     * one; a question still open is cancelled.
     */
    ask(question: Q): Promise<A> {
      pending?.answer(cancelled);
      return new Promise((resolve) => {
        const asked: Pending<Q, A> = {
          question,
          answer: (value) => {
            setPending(null);
            resolve(value);
          },
          shown: false,
        };
        setPending(asked);
        void whenSheetClosed().then(() => {
          if (pending === asked) setPending({ ...asked, shown: true });
        });
      });
    },

    cancel,

    /**
     * For the sheet that asks it: the question shown, with its answer, none when none is. A
     * question left open when the sheet goes, as on signing out, is cancelled.
     */
    useQuestion() {
      useEffect(() => cancel, []);
      return useSyncExternalStore(listeners.subscribe, shown);
    },
  };
}
