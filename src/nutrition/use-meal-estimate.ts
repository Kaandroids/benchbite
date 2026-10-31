import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { discardPhotos } from '@/lib/photos';

import { EstimateFailure, estimateMeal, type Correction, type EstimateItem } from './meal-estimate';
import type { Meal } from './meals';

/** Where an estimate of a meal's photos stands. */
export type EstimateState =
  | { kind: 'estimating' }
  | { kind: 'estimate'; items: EstimateItem[] }
  /** The photos show no food, with what Bite says it sees, if anything. */
  | { kind: 'notFood'; note?: string }
  | { kind: 'failed'; error: unknown };

/**
 * Estimates the photos of a meal, and again with a correction, or with other photos; each
 * estimate replaces the one before. Leaving stops the one that runs, as does `cancel`.
 */
export function useMealEstimate(meal: Meal, initialPhotos: string[]) {
  const { i18n } = useTranslation();
  const [photos, setPhotos] = useState(initialPhotos);
  const [state, setState] = useState<EstimateState>({ kind: 'estimating' });
  const running = useRef<AbortController | null>(null);

  // Sets the state only once the answer comes, so that an effect may start it.
  const request = useCallback(
    (correction?: Correction) => {
      running.current?.abort();
      const controller = new AbortController();
      running.current = controller;
      estimateMeal({ photos, language: i18n.language, meal, correction }, controller.signal)
        .then((answer) => {
          if (controller.signal.aborted) return;
          setState(
            answer.isFood && answer.items.length > 0
              ? { kind: 'estimate', items: answer.items }
              : { kind: 'notFood', note: answer.note },
          );
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          // A refusal is the user's state, not a failure; anything else would go unseen, as
          // preparing the photos on the device or a request the function turns down.
          if (!(error instanceof EstimateFailure && error.refusal)) {
            console.warn('Could not estimate the meal', error);
          }
          setState({ kind: 'failed', error });
        });
    },
    [photos, i18n.language, meal],
  );

  // The photos are estimated as they come.
  useEffect(() => {
    request();
    return () => running.current?.abort();
  }, [request]);
  // And deleted once other photos replace them or the screen closes.
  useEffect(() => () => discardPhotos(photos), [photos]);

  return {
    photos,
    state,
    /** Changes the items of the estimate, such as an item's grams. */
    setItems: (items: EstimateItem[]) => setState({ kind: 'estimate', items }),
    /** Estimates the same photos again, with a correction or after a failure. */
    again: (correction?: Correction) => {
      setState({ kind: 'estimating' });
      request(correction);
    },
    /** Estimates other photos of the meal. */
    retake: (next: string[]) => {
      setState({ kind: 'estimating' });
      setPhotos(next);
    },
    cancel: () => running.current?.abort(),
  };
}
