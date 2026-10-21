import { renderRouter, screen, act } from 'expo-router/testing-library';
import { useSyncExternalStore, type PropsWithChildren } from 'react';
import { Text } from 'react-native';

import AppIndex from '@/app/(app)/index';
import RootLayout from '@/app/_layout';
import OnboardingStep from '@/app/onboarding/[step]';
import OnboardingLayout from '@/app/onboarding/_layout';
import OnboardingIndex from '@/app/onboarding/index';
import { useOnboarding } from '@/providers/onboarding-provider';
import { useSession } from '@/providers/session-provider';

import type { Step } from './steps';
import type { OnboardingAnswers } from './types';

// The step screens are replaced by their names: these tests are about which one opens.
jest.mock('@/onboarding/screens', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  const { STEPS } = jest.requireActual<typeof import('@/onboarding/steps')>('@/onboarding/steps');
  return {
    STEP_SCREENS: Object.fromEntries(
      STEPS.map((step) => [step, () => <MockText>{`Step ${step}`}</MockText>]),
    ),
  };
});

jest.mock('@/providers/onboarding-provider', () => ({
  OnboardingProvider: ({ children }: PropsWithChildren) => children,
  useOnboarding: jest.fn(),
}));

jest.mock('@/providers/session-provider', () => ({
  SessionProvider: ({ children }: PropsWithChildren) => children,
  useSession: jest.fn(),
}));

// The root layout's native setup: fonts load at once and the splash screen and reminders do
// nothing.
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(), hide: jest.fn() }));
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn() }));
jest.mock('@/reminders/reminders', () => ({ showRemindersInForeground: jest.fn() }));

type OnboardingState = ReturnType<typeof useOnboarding>;

let onboarding: OnboardingState;
const listeners = new Set<() => void>();

/** Sets what useOnboarding returns, and renders the screens that use it again. */
function setOnboarding(step: Step, answers: OnboardingAnswers = {}, completed = false) {
  onboarding = {
    completed,
    draft: { step, answers },
    setStep: jest.fn(),
    answer: jest.fn(),
    complete: jest.fn(),
    reset: jest.fn(),
  };
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const ONBOARDING_ROUTES = {
  'onboarding/_layout': OnboardingLayout,
  'onboarding/index': OnboardingIndex,
  'onboarding/[step]': OnboardingStep,
};

const APP_ROUTES = {
  _layout: RootLayout,
  ...ONBOARDING_ROUTES,
  '(app)/index': AppIndex,
  'dev/components': () => <Text>Component gallery</Text>,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(useOnboarding)
    .mockImplementation(() => useSyncExternalStore(subscribe, () => onboarding));
  jest.mocked(useSession).mockReturnValue({
    status: 'ready',
    session: { user: { id: 'user-1' } } as never,
    retry: jest.fn(),
  });
});

describe('onboarding routes', () => {
  it('opens the stored step from the onboarding index', async () => {
    setOnboarding('height', { goal: 'lose_fat' });
    const app = await renderRouter(ONBOARDING_ROUTES, { initialUrl: '/onboarding' });
    expect(app.getPathname()).toBe('/onboarding/height');
    expect(screen.getByText('Step height')).toBeOnTheScreen();
  });

  it('opens a step the user has reached', async () => {
    setOnboarding('height', { goal: 'lose_fat' });
    const app = await renderRouter(ONBOARDING_ROUTES, { initialUrl: '/onboarding/goal' });
    expect(app.getPathname()).toBe('/onboarding/goal');
    expect(screen.getByText('Step goal')).toBeOnTheScreen();
  });

  it('opens the current step instead of an unknown one', async () => {
    setOnboarding('height');
    const app = await renderRouter(ONBOARDING_ROUTES, { initialUrl: '/onboarding/nonsense' });
    expect(app.getPathname()).toBe('/onboarding/height');
    expect(screen.getByText('Step height')).toBeOnTheScreen();
  });

  it('opens the current step instead of one the user has not reached', async () => {
    setOnboarding('goal');
    const app = await renderRouter(ONBOARDING_ROUTES, { initialUrl: '/onboarding/summary' });
    expect(app.getPathname()).toBe('/onboarding/goal');
    expect(screen.queryByText('Step summary')).not.toBeOnTheScreen();
  });

  it('opens the current step instead of one the answers skip', async () => {
    setOnboarding('activity', { goal: 'stay_healthy' });
    const app = await renderRouter(ONBOARDING_ROUTES, { initialUrl: '/onboarding/pace' });
    expect(app.getPathname()).toBe('/onboarding/activity');
    expect(screen.getByText('Step activity')).toBeOnTheScreen();
  });
});

describe('root layout', () => {
  it('only lets an unfinished onboarding reach the onboarding', async () => {
    setOnboarding('welcome');
    const app = await renderRouter(APP_ROUTES, { initialUrl: '/' });
    expect(app.getPathname()).toBe('/onboarding/welcome');
    expect(screen.getByText('Step welcome')).toBeOnTheScreen();
    expect(screen.queryByText('Benchbite')).not.toBeOnTheScreen();
  });

  it('opens the app once the onboarding is finished', async () => {
    setOnboarding('welcome', {}, true);
    const app = await renderRouter(APP_ROUTES, { initialUrl: '/onboarding/welcome' });
    expect(app.getPathname()).toBe('/');
    expect(screen.getByText('Benchbite')).toBeOnTheScreen();
  });

  it('switches to the app when the onboarding is finished', async () => {
    setOnboarding('summary');
    const app = await renderRouter(APP_ROUTES, { initialUrl: '/onboarding' });
    expect(app.getPathname()).toBe('/onboarding/summary');

    await act(() => setOnboarding('welcome', {}, true));
    expect(app.getPathname()).toBe('/');
    expect(screen.getByText('Benchbite')).toBeOnTheScreen();
  });

  it('shows the connection error when the sign-in failed', async () => {
    jest.mocked(useSession).mockReturnValue({
      status: 'error',
      error: new Error('offline'),
      retry: jest.fn(),
    });
    setOnboarding('welcome');
    await renderRouter(APP_ROUTES, { initialUrl: '/' });
    expect(screen.getByText('Couldn’t connect')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });

  it('shows nothing while the session is loading', async () => {
    jest.mocked(useSession).mockReturnValue({ status: 'loading', retry: jest.fn() });
    setOnboarding('welcome');
    await renderRouter(APP_ROUTES, { initialUrl: '/' });
    expect(screen.queryByText('Step welcome')).not.toBeOnTheScreen();
    expect(screen.queryByText('Benchbite')).not.toBeOnTheScreen();
  });
});
