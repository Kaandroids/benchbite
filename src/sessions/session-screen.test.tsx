import { router } from 'expo-router';
import { Alert } from 'react-native';

import { useExerciseLibrary, type LibraryExercise } from '@/exercises/library';
import { act, fireEvent, render, renderHook, screen } from '@/test/render';
import { testExercise, testWorkout } from '@/workouts/test-data';

import { FinishScreen } from './finish-screen';
import { useLogWorkout } from './logs';
import {
  resetSessionStore,
  startClock,
  startSession,
  toggleDone,
  updateSession,
  useActiveSession,
} from './session';
import { SessionScreen } from './session-screen';
import { useStartWorkout } from './start';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), dismissAll: jest.fn() },
}));
jest.mock('expo-sqlite/kv-store', () => {
  const items = new Map<string, string>();
  return {
    Storage: {
      getItemSync: (key: string) => items.get(key) ?? null,
      setItemSync: (key: string, value: string) => void items.set(key, value),
      removeItemSync: (key: string) => void items.delete(key),
    },
  };
});
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/exercises/library', () => ({
  ...jest.requireActual<typeof import('@/exercises/library')>('@/exercises/library'),
  useExerciseLibrary: jest.fn(),
}));
jest.mock('./start', () => ({ useUserId: () => 'user-a', useStartWorkout: jest.fn() }));
jest.mock('./logs', () => ({ useLogWorkout: jest.fn() }));
jest.mock('@/workouts/workouts', () => ({
  ...jest.requireActual<typeof import('@/workouts/workouts')>('@/workouts/workouts'),
  useWorkouts: () => ({ data: [{ id: 5, name: null, type: 'pull' }] }),
  exerciseImageUrl: (path: string) => `https://images.test/${path}`,
}));

const exercise = (
  id: string,
  name: string,
  metrics: LibraryExercise['metrics'],
): LibraryExercise => ({
  id,
  name,
  searchText: name.toLowerCase(),
  metrics,
  primaryMuscles: ['chest'],
  secondaryMuscles: [],
  equipment: 'barbell',
  level: 'beginner',
  category: 'strength',
  imagePaths: [],
});

const PUSH = testWorkout(4, {
  type: 'push',
  exercises: [
    testExercise('bench', { sets: 2, restSeconds: 90 }),
    testExercise('plank', { sets: 1, target: { seconds: 45, meters: null }, restSeconds: 0 }),
  ],
});

const NOW = new Date(2026, 9, 23, 18, 0);
const logWorkout = jest.fn();
const startWorkout = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW });
  resetSessionStore();
  jest.mocked(useExerciseLibrary).mockReturnValue({
    data: [
      exercise('bench', 'Bench press', ['weight', 'reps']),
      exercise('plank', 'Plank', ['duration']),
    ],
  } as never);
  jest.mocked(useLogWorkout).mockReturnValue({
    mutateAsync: logWorkout.mockResolvedValue(1),
    isPending: false,
  } as never);
  jest.mocked(useStartWorkout).mockReturnValue(startWorkout);
  startSession(
    'user-a',
    PUSH,
    { bench: [{ weightKg: 80, reps: 8, seconds: null, meters: null }] },
    NOW.getTime(),
  );
});
afterEach(() => jest.useRealTimers());

describe('SessionScreen', () => {
  it('shows the open exercise with last time and the sets filled in from it', async () => {
    await render(<SessionScreen />);
    expect(screen.getByText('Push')).toBeTruthy();
    expect(screen.getByText('0 of 3 sets')).toBeTruthy();
    expect(screen.getByText('LAST TIME')).toBeTruthy();
    expect(screen.getAllByText('80 kg × 8')).toHaveLength(1);
    expect(screen.getByLabelText('Weight of set 1').props.value).toBe('80');
    expect(screen.getByLabelText('Reps of set 2').props.value).toBe('8');
    // The plank waits, folded, with its target.
    expect(screen.getByText('1 × 45 s')).toBeTruthy();
  });

  it('logs a set, changes it and starts the rest', async () => {
    await render(<SessionScreen />);
    await fireEvent.changeText(screen.getByLabelText('Weight of set 1'), '82,5');
    await fireEvent(screen.getByLabelText('Weight of set 1'), 'endEditing');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Set 1 done' }));
    expect(screen.getByRole('checkbox', { name: 'Set 1 done' })).toBeChecked();
    expect(screen.getByLabelText('Weight of set 1').props.value).toBe('82.5');
    expect(screen.getByText('1 of 3 sets')).toBeTruthy();
    expect(screen.getByText('1:30')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '15 seconds more' }));
    expect(screen.getByText('1:45')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.queryByText('REST')).toBeNull();
  });

  it('needs a weight before a set is done, and carries it to the next sets', async () => {
    resetSessionStore();
    startSession('user-a', PUSH, {}, NOW.getTime());
    await render(<SessionScreen />);
    expect(screen.getByLabelText('Weight of set 1').props.value).toBe('');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Set 1 done' }));
    expect(screen.getByRole('checkbox', { name: 'Set 1 done' })).not.toBeChecked();
    expect(screen.getByLabelText('Weight of set 1').props['aria-invalid']).toBe(true);

    await fireEvent.changeText(screen.getByLabelText('Weight of set 1'), '44');
    await fireEvent(screen.getByLabelText('Weight of set 1'), 'endEditing');
    expect(screen.getByLabelText('Weight of set 1').props['aria-invalid']).toBe(false);
    expect(screen.getByLabelText('Weight of set 2').props.value).toBe('44');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Set 1 done' }));
    expect(screen.getByRole('checkbox', { name: 'Set 1 done' })).toBeChecked();
  });

  it('takes a typed weight before the keyboard closes', async () => {
    resetSessionStore();
    startSession('user-a', PUSH, {}, NOW.getTime());
    await render(<SessionScreen />);
    await fireEvent.changeText(screen.getByLabelText('Weight of set 1'), '55');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Set 1 done' }));
    expect(screen.getByRole('checkbox', { name: 'Set 1 done' })).toBeChecked();
  });

  it('adds a set', async () => {
    await render(<SessionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: '+ Add set' }));
    expect(screen.getByLabelText('Reps of set 3').props.value).toBe('8');
    expect(screen.getByText('0 of 4 sets')).toBeTruthy();
  });

  it('times a held exercise with a clock that counts up until it is stopped', async () => {
    await render(<SessionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Plank' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Start the clock of set 1' }));
    await act(async () => {
      jest.advanceTimersByTime(50_005);
    });
    expect(screen.getByLabelText('Time of set 1').props.value).toBe('0:50');
    await fireEvent.press(screen.getByRole('button', { name: 'Stop the clock of set 1' }));
    expect(screen.getByRole('checkbox', { name: 'Set 1 done' })).toBeChecked();
    expect(screen.getByLabelText('Time of set 1').props.value).toBe('0:50');

    // The logged time can still be corrected by hand.
    await fireEvent.changeText(screen.getByLabelText('Time of set 1'), '0:48');
    await fireEvent(screen.getByLabelText('Time of set 1'), 'endEditing');
    expect(screen.getByLabelText('Time of set 1').props.value).toBe('0:48');
  });

  it('minimizes and finishes', async () => {
    await render(<SessionScreen />);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Minimize, the workout keeps running' }),
    );
    expect(router.back).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Finish' }));
    expect(router.push).toHaveBeenCalledWith('/session/finish');
  });
});

describe('FinishScreen', () => {
  const doFirstSet = () => updateSession((session) => toggleDone(session, 0, 0));

  it('sums up a workout finished early and saves it', async () => {
    doFirstSet();
    await act(async () => {
      jest.advanceTimersByTime(42 * 60_000);
    });
    await render(<FinishScreen />);
    expect(screen.getByText('Push done')).toBeTruthy();
    expect(screen.getByText('42:00')).toBeTruthy();
    expect(screen.getByText('1 / 3')).toBeTruthy();
    expect(screen.getByText('640')).toBeTruthy();
    expect(screen.getByText('1 of 2 sets · 80 kg × 8')).toBeTruthy();
    expect(screen.getByText('Skipped')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Save workout' }));
    expect(logWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        workoutId: 4,
        exercises: [
          {
            exerciseId: 'bench',
            sets: [{ weightKg: 80, reps: 8, seconds: null, meters: null }],
          },
          { exerciseId: 'plank', sets: [] },
        ],
      }),
    );
    expect(router.dismissAll).toHaveBeenCalled();
    expect(startWorkout).not.toHaveBeenCalled();
  });

  it('logs the set of a clock that still runs', async () => {
    updateSession((session) => startClock(session, 1, 0));
    await act(async () => {
      jest.advanceTimersByTime(40_000);
    });
    await render(<FinishScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save workout' }));
    expect(logWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        exercises: [
          { exerciseId: 'bench', sets: [] },
          {
            exerciseId: 'plank',
            sets: [{ weightKg: null, reps: null, seconds: 40, meters: null }],
          },
        ],
      }),
    );
  });

  it('starts the next workout after saving', async () => {
    doFirstSet();
    await render(<FinishScreen next={5} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save workout' }));
    expect(startWorkout).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }));
  });

  it('needs a set to save, and discards after asking', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    await render(<FinishScreen />);
    expect(screen.getByText('Log at least one set to save the workout.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save workout' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Discard' }));
    const confirm = alert.mock.calls[0]?.[2]?.find((button) => button.style === 'destructive');
    await act(async () => confirm?.onPress?.());
    expect(router.dismissAll).toHaveBeenCalled();
    const { result } = await renderHook(() => useActiveSession('user-a'));
    expect(result.current).toBeNull();
  });

  it('says when saving fails and keeps the workout', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    logWorkout.mockRejectedValueOnce(new Error('offline'));
    doFirstSet();
    await render(<FinishScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save workout' }));
    expect(alert).toHaveBeenCalledWith(
      'Not saved',
      "We couldn't save the workout. Check your connection and try again.",
    );
    expect(router.dismissAll).not.toHaveBeenCalled();
  });
});
