// A stand-in for useStep in tests of the onboarding screens. Each test file mocks the hook with
// it:
//
//   let mockStep = createStep();
//   jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));
import type { SectionProgressProps } from '@/components/ui/section-progress';
import type { OnboardingAnswers } from '@/onboarding/types';

export type StepMock = {
  answers: OnboardingAnswers;
  progress: SectionProgressProps;
  answer: jest.Mock<void, [OnboardingAnswers]>;
  next: jest.Mock<void, [OnboardingAnswers?]>;
  back: jest.Mock<void, []>;
  select: jest.Mock<void, [OnboardingAnswers]>;
};

export function createStep(answers: OnboardingAnswers = {}): StepMock {
  const answer = jest.fn<void, [OnboardingAnswers]>();
  return {
    answers,
    progress: {
      sections: ['About you', 'Training', 'Your plan'],
      current: 0,
      value: 0.5,
      overall: 0.25,
    },
    answer,
    next: jest.fn(),
    back: jest.fn(),
    // Like the hook, saves only an answer that differs from the one given here.
    select: jest.fn((choice: OnboardingAnswers) => {
      const keys = Object.keys(choice) as (keyof OnboardingAnswers)[];
      if (keys.some((key) => choice[key] !== answers[key])) {
        answer(choice);
      }
    }),
  };
}
