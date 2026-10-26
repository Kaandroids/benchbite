// What each workout length holds for the user's answers, from the plan builder, so the length
// step can show it before the plan is built for good.
import { useQueries } from '@tanstack/react-query';

import type { SessionMinutes } from '@shared/plan/limits';
import type { Plan, SessionTime, SessionWork } from '@shared/plan/types';

import { generatePlan } from './plan';
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
 * Asks the plan builder about every length at once when the step opens, so switching between
 * them shows the answer straight away. The answers it depends on are fixed by then.
 */
export function useLengthPreviews(answers: OnboardingAnswers) {
  const results = useQueries({
    queries: SESSION_MINUTES.map((sessionMinutes) => ({
      queryKey: [
        'onboarding',
        'length-preview',
        answers.goal,
        answers.experience,
        answers.setup,
        answers.trainingDays?.join(),
        sessionMinutes,
      ],
      queryFn: async () => previewOf(await generatePlan({ ...answers, sessionMinutes })),
      staleTime: Infinity,
    })),
  });
  return (sessionMinutes: SessionMinutes) => results[SESSION_MINUTES.indexOf(sessionMinutes)]!;
}
