// The first exercises a plan gives for each setup, so the setup step can show them.
import { useQueries } from '@tanstack/react-query';

import { Constants } from '@/lib/database.types';

import { generatePlan } from './plan';
import { planRequest } from './plan-request';
import type { OnboardingAnswers } from './types';

type Setup = NonNullable<OnboardingAnswers['setup']>;

/** How many of the first workout's exercises to show. */
const EXAMPLES = 3;
/** The length asked for before the user picks one, on the next step. */
const PREVIEW_MINUTES = 45;

/**
 * The ids of the first exercises of the first workout the plan builder makes with the given
 * setup, for the user's answers so far. Every setup is asked about at once when the step opens,
 * so switching shows them straight away. Empty while loading or without a connection: the
 * examples are only a hint.
 */
export function useSetupExamples(answers: OnboardingAnswers, setup: Setup | undefined): string[] {
  // The steps before guarantee these; without them there is nothing to ask.
  const ready = Boolean(answers.goal && answers.experience && answers.trainingDays);
  const results = useQueries({
    queries: Constants.public.Enums.training_setup.map((option) => {
      const request = ready
        ? planRequest({
            ...answers,
            setup: option,
            sessionMinutes: answers.sessionMinutes ?? PREVIEW_MINUTES,
          })
        : null;
      return {
        queryKey: ['onboarding', 'setup-examples', request],
        queryFn: async () => {
          const plan = await generatePlan(request!);
          return (plan.sessions[0]?.exercises ?? [])
            .filter((exercise) => exercise.slot !== 'conditioning')
            .slice(0, EXAMPLES)
            .map((exercise) => exercise.exerciseId);
        },
        enabled: request !== null,
        staleTime: Infinity,
        retry: false,
      };
    }),
  });
  if (!setup) {
    return [];
  }
  return results[Constants.public.Enums.training_setup.indexOf(setup)]?.data ?? [];
}
