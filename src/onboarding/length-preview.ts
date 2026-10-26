// What each workout length holds for the user's answers, from the plan builder, so the length
// step can show it before the plan is built for good.
import { useQueries } from '@tanstack/react-query';

import type { SessionMinutes } from '@shared/plan/limits';
import type { Plan, SessionTime, SessionWork } from '@shared/plan/types';

import { generatePlan } from './plan';
import { planRequest } from './plan-request';
import { SESSION_MINUTES } from './training';
import type { OnboardingAnswers } from './types';

export type LengthPreview = { work: SessionWork; time: SessionTime };

/** The first workout of a plan, as the length step shows it. */
export function previewOf(plan: Plan): LengthPreview | null {
  const session = plan.sessions[0];
  // A plan builder deployed before it said where the time goes leaves these out.
  if (!session?.time || !session.work) {
    return null;
  }
  return { work: session.work, time: session.time };
}

/**
 * The minutes of each part, rounded so that together they make the rounded whole: each part is
 * the difference between rounded running totals, so the strip never adds up to more than the
 * workout takes.
 */
export function partMinutes(time: SessionTime): SessionTime {
  let seconds = 0;
  let shown = 0;
  const minutes = (part: number) => {
    seconds += part;
    const rounded = Math.round(seconds / 60) - shown;
    shown += rounded;
    return rounded;
  };
  return {
    warmUp: minutes(time.warmUp),
    main: minutes(time.main),
    extras: minutes(time.extras),
    conditioning: minutes(time.conditioning),
  };
}

/**
 * What the given length holds for the user's answers. The plan builder is asked about every
 * length at once when the step opens, so switching between them shows the answer straight away;
 * the answers it depends on are fixed by then. It is not asked again on failure: the preview is
 * only a hint, and the length can be chosen without it.
 */
export function useLengthPreview(answers: OnboardingAnswers, sessionMinutes: SessionMinutes) {
  const results = useQueries({
    queries: SESSION_MINUTES.map((minutes) => {
      const request = planRequest({ ...answers, sessionMinutes: minutes });
      return {
        queryKey: ['onboarding', 'length-preview', request],
        queryFn: async () => previewOf(await generatePlan(request)),
        staleTime: Infinity,
        retry: false,
      };
    }),
  });
  return results[SESSION_MINUTES.indexOf(sessionMinutes)]!;
}
