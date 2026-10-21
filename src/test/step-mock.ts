// A stand-in for useStep in tests of the onboarding screens. Each test file mocks the hook with
// it:
//
//   let mockStep = createStep();
//   jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));
import type { OnboardingAnswers } from '@/onboarding/types';

export type StepMock = {
  answers: OnboardingAnswers;
  progress: number;
  next: jest.Mock<void, [OnboardingAnswers?]>;
  back: jest.Mock<void, []>;
  choose: jest.Mock<void, [OnboardingAnswers]>;
};

export function createStep(answers: OnboardingAnswers = {}): StepMock {
  return { answers, progress: 0.5, next: jest.fn(), back: jest.fn(), choose: jest.fn() };
}
