import { router } from 'expo-router';
import { renderRouter, screen, act, fireEvent } from 'expo-router/testing-library';
import { useSyncExternalStore, type PropsWithChildren } from 'react';
import { Text } from 'react-native';

import AppLayout from '@/app/(app)/_layout';
import AppIndex from '@/app/(app)/index';
import NutritionTab from '@/app/(app)/nutrition';
import ProgressTab from '@/app/(app)/progress';
import WorkoutDetail from '@/app/(app)/workout/[id]';
import WorkoutLayout from '@/app/(app)/workout/_layout';
import WorkoutArchive from '@/app/(app)/workout/archive';
import ExerciseDetails from '@/app/(app)/workout/exercise/[id]';
import PickExercises from '@/app/(app)/workout/pick';
import EditWorkout from '@/app/(app)/workout/edit';
import WorkoutTab from '@/app/(app)/workout/index';
import CreateAccountRoute from '@/app/account/create';
import SessionExerciseDetails from '@/app/session/exercise/[id]';
import SessionExerciseHistory from '@/app/session/exercise/history';
import SettingsRoute from '@/app/settings';
import LogInRoute from '@/app/account/login';
import RootLayout from '@/app/_layout';
import OnboardingStep from '@/app/onboarding/[step]';
import OnboardingLayout from '@/app/onboarding/_layout';
import OnboardingIndex from '@/app/onboarding/index';
import { useOnboarding } from '@/providers/onboarding-provider';
import { useIsAccount, useSession } from '@/providers/session-provider';
import { onboardingValue, sessionValue } from '@/test/context-mocks';

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

// The Today screen loads the user's data; these tests only need to see that it opens.
jest.mock('@/today/today-screen', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { TodayScreen: () => <MockText>Today screen</MockText> };
});

// The workout screens load the user's workouts; these tests only check which one opens.
jest.mock('@/workouts/workouts-screen', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { WorkoutsScreen: () => <MockText>Workouts screen</MockText> };
});
jest.mock('@/workouts/archive-screen', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ArchiveScreen: () => <MockText>Archive screen</MockText> };
});
jest.mock('@/workouts/workout-screen', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { WorkoutScreen: ({ id }: { id: number }) => <MockText>{`Workout ${id}`}</MockText> };
});

jest.mock('@/workouts/editor-screen', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    EditorScreen: ({ id }: { id?: number }) => <MockText>{`Editor ${id ?? 'new'}`}</MockText>,
  };
});
jest.mock('@/workouts/picker-screen', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { PickerScreen: () => <MockText>Picker screen</MockText> };
});
jest.mock('@/exercises/exercise-screen', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ExerciseScreen: ({ id }: { id: string }) => <MockText>{`Exercise ${id}`}</MockText> };
});

// The account screens show what the routes give them, and report success with a button.
jest.mock('@/account/log-in-screen', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    LogInScreen: ({ leavesGuestData }: { leavesGuestData: boolean }) => (
      <MockText>{`Log in ${leavesGuestData ? 'with' : 'without'} guest data`}</MockText>
    ),
  };
});
jest.mock('@/account/create-account-screen', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    CreateAccountScreen: ({ onCreated }: { onCreated: () => void }) => (
      <MockText onPress={onCreated}>Create account screen</MockText>
    ),
  };
});
jest.mock('@/history/exercise-history-screen', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ExerciseHistoryScreen: ({ id, opensLogs }: { id: string; opensLogs: boolean }) => (
      <MockText>{`History ${id}${opensLogs ? '' : ' without logs'}`}</MockText>
    ),
  };
});
jest.mock('@/settings/settings-screen', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SettingsScreen: () => <MockText>Settings screen</MockText> };
});
jest.mock('@/sessions/left-open', () => ({ LeftOpenSaver: () => null }));
jest.mock('@/sessions/start-move', () => ({ StartMoveSheet: () => null }));
jest.mock('@/reminders/reminder-sync', () => ({ ReminderSync: () => null }));
jest.mock('@/history/recent-logs', () => ({ RecentLogs: () => null }));
jest.mock('@/sessions/rest-alarm', () => ({
  REST_NOTIFICATION_ID: 'rest-end',
  RestAlarm: () => null,
}));
jest.mock('@/providers/onboarding-provider', () => ({
  OnboardingProvider: ({ children }: PropsWithChildren) => children,
  useOnboarding: jest.fn(),
}));

jest.mock('@/providers/session-provider', () => ({
  SessionProvider: ({ children }: PropsWithChildren) => children,
  useSession: jest.fn(),
  useUserId: jest.fn(),
  useIsAccount: jest.fn(),
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
  onboarding = onboardingValue({ completed, draft: { step, answers } });
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

const TODAY = 'Today screen';

const APP_ROUTES = {
  _layout: RootLayout,
  ...ONBOARDING_ROUTES,
  '(app)/_layout': AppLayout,
  '(app)/index': AppIndex,
  '(app)/workout/_layout': WorkoutLayout,
  '(app)/workout/index': WorkoutTab,
  '(app)/workout/archive': WorkoutArchive,
  '(app)/workout/[id]': WorkoutDetail,
  '(app)/workout/exercise/[id]': ExerciseDetails,
  '(app)/workout/pick': PickExercises,
  '(app)/workout/edit': EditWorkout,
  '(app)/nutrition': NutritionTab,
  '(app)/progress': ProgressTab,
  settings: SettingsRoute,
  'session/index': () => <Text>Workout in progress</Text>,
  'session/exercise/[id]': SessionExerciseDetails,
  'session/exercise/history': SessionExerciseHistory,
  'account/create': CreateAccountRoute,
  'account/login': LogInRoute,
  'dev/components': () => <Text>Component gallery</Text>,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(useOnboarding)
    .mockImplementation(() => useSyncExternalStore(subscribe, () => onboarding));
  jest.mocked(useSession).mockReturnValue(sessionValue('user-1'));
  jest.mocked(useIsAccount).mockReturnValue(false);
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
    expect(screen.queryByText(TODAY)).not.toBeOnTheScreen();
  });

  it('opens the app once the onboarding is finished', async () => {
    setOnboarding('welcome', {}, true);
    const app = await renderRouter(APP_ROUTES, { initialUrl: '/onboarding/welcome' });
    expect(app.getPathname()).toBe('/');
    expect(screen.getByText(TODAY)).toBeOnTheScreen();
  });

  it('switches to the app when the onboarding is finished', async () => {
    setOnboarding('summary');
    const app = await renderRouter(APP_ROUTES, { initialUrl: '/onboarding' });
    expect(app.getPathname()).toBe('/onboarding/summary');

    await act(() => setOnboarding('welcome', {}, true));
    expect(app.getPathname()).toBe('/');
    expect(screen.getByText(TODAY)).toBeOnTheScreen();
  });

  it('shows the connection error when the sign-in failed', async () => {
    jest
      .mocked(useSession)
      .mockReturnValue(sessionValue({ status: 'error', error: new Error('offline') }));
    setOnboarding('welcome');
    await renderRouter(APP_ROUTES, { initialUrl: '/' });
    expect(screen.getByText('Couldn’t connect')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });

  it('shows nothing while the session is loading', async () => {
    jest.mocked(useSession).mockReturnValue(sessionValue({ status: 'loading' }));
    setOnboarding('welcome');
    await renderRouter(APP_ROUTES, { initialUrl: '/' });
    expect(screen.queryByText('Step welcome')).not.toBeOnTheScreen();
    expect(screen.queryByText(TODAY)).not.toBeOnTheScreen();
  });

  it('shows it is loading while it waits for the server to say whether the onboarding was finished', async () => {
    setOnboarding('welcome');
    onboarding = { ...onboarding, checking: true };
    await renderRouter(APP_ROUTES, { initialUrl: '/' });
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.queryByText('Step welcome')).not.toBeOnTheScreen();
    expect(screen.queryByText(TODAY)).not.toBeOnTheScreen();
  });
});

describe('account screens', () => {
  it('lets the onboarding open the log in, without guest data to leave behind', async () => {
    setOnboarding('welcome');
    const app = await renderRouter(APP_ROUTES, { initialUrl: '/' });
    await act(() => router.push('/account/login'));
    expect(app.getPathname()).toBe('/account/login');
    expect(screen.getByText('Log in without guest data')).toBeOnTheScreen();
  });

  it('warns a guest who finished the onboarding that their data stays behind', async () => {
    setOnboarding('welcome', {}, true);
    await renderRouter(APP_ROUTES, { initialUrl: '/' });
    await act(() => router.push('/account/login'));
    expect(screen.getByText('Log in with guest data')).toBeOnTheScreen();
  });

  it.each(['/account/create', '/account/login'] as const)(
    'turns an account away from %s, also when a link opens it',
    async (path) => {
      jest.mocked(useIsAccount).mockReturnValue(true);
      setOnboarding('welcome', {}, true);
      const app = await renderRouter(APP_ROUTES, { initialUrl: path });
      expect(app.getPathname()).toBe('/');
      expect(screen.queryByText('Create account screen')).not.toBeOnTheScreen();
    },
  );

  it('goes on to Today once the account is created', async () => {
    setOnboarding('welcome', {}, true);
    const app = await renderRouter(APP_ROUTES, { initialUrl: '/progress' });
    await act(() => router.push('/account/create'));
    await act(() => fireEvent.press(screen.getByText('Create account screen')));
    expect(app.getPathname()).toBe('/');
  });
});

/** The native tabs in order, as titles; the focused one is the only one that takes touches. */
function tabs() {
  return screen.container
    .queryAll((node) => String(node.type).startsWith('RNSTabsScreen'))
    .map((tab) => ({ title: tab.props.title, focused: tab.props.pointerEvents !== 'none' }));
}

describe('app tabs', () => {
  beforeEach(() => setOnboarding('welcome', {}, true));

  it('shows Today, Workout, Nutrition and Progress, starting on Today', async () => {
    await renderRouter(APP_ROUTES, { initialUrl: '/' });
    expect(tabs()).toEqual([
      { title: 'Today', focused: true },
      { title: 'Workout', focused: false },
      { title: 'Nutrition', focused: false },
      { title: 'Progress', focused: false },
    ]);
  });

  it.each([
    ['/workout', 'Workout'],
    ['/nutrition', 'Nutrition'],
    ['/progress', 'Progress'],
  ] as const)('opens %s on its tab', async (path, title) => {
    const app = await renderRouter(APP_ROUTES, { initialUrl: '/' });
    await act(() => router.navigate(path));
    expect(app.getPathname()).toBe(path);
    expect(tabs().filter((tab) => tab.focused)).toEqual([{ title, focused: true }]);
  });

  it.each([
    ['/workout', 'Workouts screen'],
    ['/workout/archive', 'Archive screen'],
    ['/workout/7', 'Workout 7'],
    ['/workout/exercise/Plank', 'Exercise Plank'],
    ['/workout/pick', 'Picker screen'],
    ['/workout/edit', 'Editor new'],
    ['/workout/edit?id=7', 'Editor 7'],
  ] as const)('opens %s inside the Workout tab', async (path, text) => {
    const app = await renderRouter(APP_ROUTES, { initialUrl: '/' });
    await act(() => router.navigate(path));
    expect(app.getPathname()).toBe(path.split('?')[0]);
    expect(screen.getByText(text)).toBeOnTheScreen();
    expect(tabs().filter((tab) => tab.focused)).toEqual([{ title: 'Workout', focused: true }]);
  });

  it('opens the settings from the Progress tab', async () => {
    const app = await renderRouter(APP_ROUTES, { initialUrl: '/progress' });
    await act(() => fireEvent.press(screen.getByRole('button', { name: 'Settings' })));
    expect(app.getPathname()).toBe('/settings');
    expect(screen.getByText('Settings screen')).toBeOnTheScreen();
  });

  it.each([
    ['/session/exercise/Plank', 'Exercise Plank'],
    ['/session/exercise/history?id=Plank', 'History Plank without logs'],
  ] as const)('opens %s over the workout in progress, and goes back to it', async (path, text) => {
    const app = await renderRouter(APP_ROUTES, { initialUrl: '/' });
    await act(() => router.push('/session'));
    await act(() => router.push(path));
    expect(screen.getByText(text)).toBeOnTheScreen();
    await act(() => router.back());
    expect(app.getPathname()).toBe('/session');
    expect(screen.getByText('Workout in progress')).toBeOnTheScreen();
  });

  it('links to the component gallery in development', async () => {
    const app = await renderRouter(APP_ROUTES, { initialUrl: '/' });
    await act(() => router.navigate('/dev/components'));
    expect(app.getPathname()).toBe('/dev/components');
    expect(screen.getByText('Component gallery')).toBeOnTheScreen();
  });
});
