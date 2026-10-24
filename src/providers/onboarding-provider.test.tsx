import type { Session } from '@supabase/supabase-js';
import type { PropsWithChildren } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { supabase } from '@/lib/supabase';
import { act, renderHook, waitFor } from '@/test/render';

import { OnboardingProvider, useOnboarding } from './onboarding-provider';
import { useSession } from './session-provider';

jest.mock('expo-sqlite/kv-store', () => {
  const items = new Map<string, string>();
  return {
    Storage: {
      items,
      getItemSync: (key: string) => items.get(key) ?? null,
      setItemSync: (key: string, value: string) => void items.set(key, value),
      removeItemSync: (key: string) => void items.delete(key),
      getAllKeysSync: () => [...items.keys()],
    },
  };
});

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

jest.mock('./session-provider', () => ({ useSession: jest.fn() }));

const { items: stored } = jest.requireMock<{ Storage: { items: Map<string, string> } }>(
  'expo-sqlite/kv-store',
).Storage;

const maybeSingle = jest.fn();
const eq = jest.fn(() => ({ maybeSingle }));
const select = jest.fn(() => ({ eq }));

let appStateListener: ((state: AppStateStatus) => void) | undefined;
const removeAppStateListener = jest.fn();

function signIn(userId: string | null) {
  jest.mocked(useSession).mockReturnValue(
    userId
      ? {
          status: 'ready',
          session: { user: { id: userId } } as Session,
          retry: jest.fn(),
          startAgain: jest.fn(),
        }
      : { status: 'loading', retry: jest.fn(), startAgain: jest.fn() },
  );
}

function storedDraft(userId: string) {
  const value = stored.get(`onboarding.${userId}.draft`);
  return value ? JSON.parse(value) : null;
}

function renderOnboarding() {
  return renderHook(() => useOnboarding(), {
    wrapper: ({ children }: PropsWithChildren) => (
      <OnboardingProvider>{children}</OnboardingProvider>
    ),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  stored.clear();
  signIn('user-1');
  jest.mocked(supabase.from).mockReturnValue({ select } as never);
  maybeSingle.mockResolvedValue({ data: null, error: null });
  appStateListener = undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as (state: AppStateStatus) => void;
    return { remove: removeAppStateListener };
  });
});

describe('OnboardingProvider', () => {
  it('starts at the welcome step while the session is loading', async () => {
    signIn(null);
    const { result } = await renderOnboarding();
    expect(result.current.completed).toBe(false);
    expect(result.current.draft).toEqual({ step: 'welcome', answers: {} });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('loads the stored draft and completed flag of the user', async () => {
    stored.set(
      'onboarding.user-1.draft',
      JSON.stringify({ version: 1, step: 'height', answers: { goal: 'lose_fat' } }),
    );
    const { result } = await renderOnboarding();
    expect(result.current.draft).toEqual({ step: 'height', answers: { goal: 'lose_fat' } });
    expect(result.current.completed).toBe(false);

    stored.set('onboarding.user-1.completed', 'true');
    const { result: completed } = await renderOnboarding();
    expect(completed.current.completed).toBe(true);
  });

  it('merges and prunes answers and saves the draft', async () => {
    const { result } = await renderOnboarding();
    await act(() => result.current.answer({ goal: 'lose_fat', targetWeightKg: 70 }));
    await act(() => result.current.answer({ weightKg: 80 }));
    expect(result.current.draft.answers).toEqual({
      goal: 'lose_fat',
      targetWeightKg: 70,
      weightKg: 80,
    });

    await act(() => result.current.answer({ goal: 'stay_healthy' }));
    expect(result.current.draft.answers).toEqual({ goal: 'stay_healthy', weightKg: 80 });
    expect(storedDraft('user-1')).toEqual({
      version: 1,
      step: 'welcome',
      answers: { goal: 'stay_healthy', weightKg: 80 },
    });
  });

  // Regression: new functions after every answer ran the steps' focus effects again, which let a
  // quick second tap open the next step twice.
  it('keeps its functions while the draft changes', async () => {
    const { result } = await renderOnboarding();
    const { setStep, answer, complete, reset } = result.current;
    await act(() => result.current.answer({ goal: 'lose_fat' }));
    await act(() => result.current.setStep('goal'));
    expect(result.current.draft).toMatchObject({ step: 'goal', answers: { goal: 'lose_fat' } });
    expect(result.current.setStep).toBe(setStep);
    expect(result.current.answer).toBe(answer);
    expect(result.current.complete).toBe(complete);
    expect(result.current.reset).toBe(reset);
  });

  it('saves the step', async () => {
    const { result } = await renderOnboarding();
    await act(() => result.current.setStep('goal'));
    expect(result.current.draft.step).toBe('goal');
    expect(storedDraft('user-1')).toMatchObject({ step: 'goal' });
  });

  it('marks the onboarding completed and clears the draft', async () => {
    const { result } = await renderOnboarding();
    await act(() => result.current.setStep('summary'));
    await act(() => result.current.complete());
    expect(result.current.completed).toBe(true);
    expect(result.current.draft).toEqual({ step: 'welcome', answers: {} });
    expect(stored.get('onboarding.user-1.completed')).toBe('true');
    expect(storedDraft('user-1')).toBeNull();

    // The last step may record itself once more; that must not bring the draft back.
    await act(() => result.current.setStep('summary'));
    expect(storedDraft('user-1')).toBeNull();
  });

  it('starts again on reset', async () => {
    stored.set('onboarding.user-1.completed', 'true');
    const { result } = await renderOnboarding();
    await act(() => result.current.reset());
    expect(result.current.completed).toBe(false);
    expect(stored.has('onboarding.user-1.completed')).toBe(false);

    await act(() => result.current.setStep('goal'));
    expect(storedDraft('user-1')).toMatchObject({ step: 'goal' });
  });

  it('marks the onboarding completed when the server says it was finished', async () => {
    maybeSingle.mockResolvedValue({
      data: { onboarding_completed_at: '2026-10-01T10:00:00Z' },
      error: null,
    });
    const { result } = await renderOnboarding();
    await waitFor(() => expect(result.current.completed).toBe(true));
    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(stored.get('onboarding.user-1.completed')).toBe('true');
  });

  it('never undoes a finished onboarding from the server', async () => {
    stored.set('onboarding.user-1.completed', 'true');
    const { result } = await renderOnboarding();
    await waitFor(() => expect(maybeSingle).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current.completed).toBe(true);
    expect(stored.get('onboarding.user-1.completed')).toBe('true');
  });

  it('asks the server again when the app returns to the foreground until it answers', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: new Error('offline') });
    const { result } = await renderOnboarding();
    await waitFor(() => expect(maybeSingle).toHaveBeenCalledTimes(1));

    await act(async () => appStateListener?.('background'));
    expect(maybeSingle).toHaveBeenCalledTimes(1);

    maybeSingle.mockResolvedValueOnce({
      data: { onboarding_completed_at: '2026-10-01T10:00:00Z' },
      error: null,
    });
    await act(async () => appStateListener?.('active'));
    await waitFor(() => expect(result.current.completed).toBe(true));
    expect(maybeSingle).toHaveBeenCalledTimes(2);

    await act(async () => appStateListener?.('active'));
    expect(maybeSingle).toHaveBeenCalledTimes(2);
  });

  it('stops listening for the foreground on unmount', async () => {
    const { unmount } = await renderOnboarding();
    await unmount();
    expect(removeAppStateListener).toHaveBeenCalledTimes(1);
  });

  it('gives a different user a fresh state and forgets other users', async () => {
    stored.set(
      'onboarding.user-1.draft',
      JSON.stringify({ version: 1, step: 'height', answers: { goal: 'lose_fat' } }),
    );
    stored.set('unrelated', 'kept');
    const { result, rerender } = await renderOnboarding();
    expect(result.current.draft.step).toBe('height');

    signIn('user-2');
    await rerender({});
    expect(result.current.draft).toEqual({ step: 'welcome', answers: {} });
    expect(result.current.completed).toBe(false);
    expect(stored.has('onboarding.user-1.draft')).toBe(false);
    expect(stored.get('unrelated')).toBe('kept');
    expect(eq).toHaveBeenLastCalledWith('user_id', 'user-2');
  });
});

describe('useOnboarding', () => {
  it('throws outside an OnboardingProvider', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(renderHook(() => useOnboarding())).rejects.toThrow(
      'useOnboarding must be used inside an OnboardingProvider',
    );
  });
});
