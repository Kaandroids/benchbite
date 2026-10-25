import { router } from 'expo-router';
import { BackHandler } from 'react-native';

import { useOnboarding } from '@/providers/onboarding-provider';
import { act, renderHook } from '@/test/render';

import type { Step } from './steps';
import type { OnboardingAnswers } from './types';
import { useStep } from './use-step';

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn() },
    // The screen counts as focused while it is mounted.
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});

jest.mock('@/providers/onboarding-provider', () => ({ useOnboarding: jest.fn() }));

const setStep = jest.fn();
const answer = jest.fn();
const complete = jest.fn();

let hardwareBack: (() => boolean | null | undefined) | undefined;
const removeBackHandler = jest.fn();

function renderStep(step: Step, answers: OnboardingAnswers = {}) {
  jest.mocked(useOnboarding).mockReturnValue({
    completed: false,
    checking: false,
    draft: { step, answers },
    setStep,
    answer,
    complete,
    reset: jest.fn(),
  });
  return renderHook(() => useStep(step));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(router.canGoBack).mockReturnValue(true);
  hardwareBack = undefined;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    hardwareBack = () => handler({} as never);
    return { remove: removeBackHandler };
  });
});

describe('useStep', () => {
  it('records the step when its screen is focused', async () => {
    await renderStep('height');
    expect(setStep).toHaveBeenCalledWith('height');
  });

  it('returns the answers so far and the progress', async () => {
    const { result } = await renderStep('goal', { goal: 'lose_fat' });
    expect(result.current.answers).toEqual({ goal: 'lose_fat' });
    expect(result.current.progress).toBeCloseTo(1 / 19);

    const { result: last } = await renderStep('summary');
    expect(last.current.progress).toBe(1);
  });

  it('saves answers without moving on', async () => {
    const { result } = await renderStep('consent');
    await act(() => result.current.answer({ consentedPolicyVersion: undefined }));
    expect(answer).toHaveBeenCalledWith({ consentedPolicyVersion: undefined });
    expect(router.push).not.toHaveBeenCalled();
  });

  it('saves the answers and opens the next step for them', async () => {
    const { result } = await renderStep('weight', { goal: 'stay_healthy' });
    await act(() => result.current.next({ weightKg: 80 }));
    expect(answer).toHaveBeenCalledWith({ weightKg: 80 });
    expect(setStep).toHaveBeenLastCalledWith('activity');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/onboarding/[step]',
      params: { step: 'activity' },
    });
  });

  it('decides the next step with the answers given to next', async () => {
    const { result } = await renderStep('weight', { goal: 'stay_healthy' });
    await act(() => result.current.next({ goal: 'lose_fat' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/onboarding/[step]',
      params: { step: 'target-weight' },
    });
  });

  it('finishes the onboarding after the last step', async () => {
    const { result } = await renderStep('summary');
    await act(() => result.current.next());
    expect(answer).toHaveBeenCalledWith({});
    expect(complete).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('opens the next step only once on a quick second tap', async () => {
    const { result } = await renderStep('welcome');
    await act(() => {
      result.current.next();
      result.current.next();
    });
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(answer).toHaveBeenCalledTimes(1);
  });

  // Regression: going back from the plan showed the finished building screen.
  it('replaces the building step with the plan, so going back skips it', async () => {
    const { result } = await renderStep('building');
    await act(() => result.current.next());
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/onboarding/[step]',
      params: { step: 'plan' },
    });
    expect(router.push).not.toHaveBeenCalled();

    const { result: plan } = await renderStep('plan');
    jest.mocked(router.canGoBack).mockReturnValue(false);
    await act(() => plan.current.back?.());
    expect(router.replace).toHaveBeenLastCalledWith({
      pathname: '/onboarding/[step]',
      params: { step: 'session-length' },
    });
  });

  describe('choose', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('saves the choice right away and opens the next step after a moment', async () => {
      const { result } = await renderStep('goal');
      await act(() => result.current.choose({ goal: 'lose_fat' }));
      expect(answer).toHaveBeenCalledWith({ goal: 'lose_fat' });
      expect(router.push).not.toHaveBeenCalled();

      await act(() => jest.runAllTimers());
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/onboarding/[step]',
        params: { step: 'goal-insight' },
      });
    });

    // Regression: a second choice within the delay was saved, but the first one decided the
    // next step and was saved again after it.
    it('ignores further choices until the next step opens', async () => {
      const { result } = await renderStep('weight', { goal: 'lose_fat' });
      await act(() => {
        result.current.choose({ goal: 'lose_fat' });
        result.current.choose({ goal: 'stay_healthy' });
        result.current.next({ goal: 'stay_healthy' });
      });
      await act(() => jest.runAllTimers());
      expect(answer).toHaveBeenCalledTimes(2);
      expect(answer).not.toHaveBeenCalledWith({ goal: 'stay_healthy' });
      expect(router.push).toHaveBeenCalledTimes(1);
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/onboarding/[step]',
        params: { step: 'target-weight' },
      });
    });

    // Regression: the next step opened on top of the step the user had gone back to.
    it('does not move on when the screen is left before the delay', async () => {
      const { result, unmount } = await renderStep('goal');
      await act(() => result.current.choose({ goal: 'lose_fat' }));
      await unmount();
      await act(() => jest.runAllTimers());
      expect(router.push).not.toHaveBeenCalled();
    });
  });

  it('goes back in the history when it can', async () => {
    const { result } = await renderStep('activity', { goal: 'stay_healthy' });
    await act(() => result.current.back?.());
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('opens the previous step for the answers after resuming', async () => {
    jest.mocked(router.canGoBack).mockReturnValue(false);
    const { result } = await renderStep('activity', { goal: 'stay_healthy' });
    await act(() => result.current.back?.());
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/onboarding/[step]',
      params: { step: 'weight' },
    });
  });

  it('has no back on the first step', async () => {
    const { result } = await renderStep('welcome');
    expect(result.current.back).toBeUndefined();
  });

  describe("Android's back button", () => {
    it('opens the previous step after resuming', async () => {
      jest.mocked(router.canGoBack).mockReturnValue(false);
      await renderStep('pace', { goal: 'lose_fat' });
      expect(hardwareBack?.()).toBe(true);
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/onboarding/[step]',
        params: { step: 'target-weight' },
      });
    });

    it('is left to the navigator when there is history', async () => {
      await renderStep('pace', { goal: 'lose_fat' });
      expect(hardwareBack?.()).toBe(false);
      expect(router.back).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
    });

    it('is left to the system on the first step', async () => {
      jest.mocked(router.canGoBack).mockReturnValue(false);
      await renderStep('welcome');
      expect(hardwareBack?.()).toBe(false);
      expect(router.replace).not.toHaveBeenCalled();
    });

    // Regression: the back button left the summary, after the onboarding was saved.
    it('does nothing on the summary', async () => {
      const { result } = await renderStep('summary');
      expect(result.current.back).toBeUndefined();
      expect(hardwareBack?.()).toBe(true);
      expect(router.back).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
    });

    it('stops listening when the screen loses focus', async () => {
      const { unmount } = await renderStep('pace', { goal: 'lose_fat' });
      await unmount();
      expect(removeBackHandler).toHaveBeenCalled();
    });
  });
});
