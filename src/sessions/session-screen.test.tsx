import {
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-notifications/build/NotificationPermissions';
import { router } from 'expo-router';
import { Alert, Keyboard } from 'react-native';

import { useExerciseLibrary, type LibraryExercise } from '@/exercises/library';
import { act, fireEvent, render, renderHook, screen } from '@/test/render';
import { testExercise, testWorkout } from '@/workouts/test-data';

import { FinishScreen } from './finish-screen';
import { useLogWorkout } from './logs';
import { resetPermission } from './rest-alarm';
import {
  resetSessionStore,
  setValues,
  startClock,
  startSession,
  toggleDone,
  updateSession,
  useActiveSession,
} from './session';
import { SessionScreen } from './session-screen';
import { useStartWorkout } from './start';

jest.mock('@/exercises/images', () => ({
  exerciseImageUrl: (path: string) => `https://images.test/${path}`,
}));
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
jest.mock('./start', () => ({ useStartWorkout: jest.fn() }));
jest.mock('@/providers/session-provider', () => ({ useUserId: () => 'user-a' }));
jest.mock('./logs', () => ({ useLogWorkout: jest.fn() }));
jest.mock('expo-notifications/build/NotificationPermissions', () => ({
  getPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(),
}));
jest.mock('@/workouts/workouts', () => ({
  ...jest.requireActual<typeof import('@/workouts/workouts')>('@/workouts/workouts'),
  useWorkouts: () => ({ data: [{ id: 5, name: null, type: 'pull' }] }),
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
  custom: false,
  archived: false,
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
  resetPermission();
  jest.mocked(getPermissionsAsync).mockResolvedValue({ granted: true, canAskAgain: true } as never);
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
    { now: NOW.getTime() },
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
    // Alerts are allowed, so the rest bar has no bell.
    expect(screen.queryByRole('button', { name: 'Turn on rest alerts' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.queryByText('REST')).toBeNull();
  });

  it('offers to turn rest alerts on from the rest bar while they are off', async () => {
    jest
      .mocked(getPermissionsAsync)
      .mockResolvedValue({ granted: false, canAskAgain: true } as never);
    await render(<SessionScreen />);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Set 1 done' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Turn on rest alerts' }));
    expect(requestPermissionsAsync).toHaveBeenCalled();
  });

  it('keeps typed values within what a set can hold', async () => {
    await render(<SessionScreen />);
    expect(screen.getByLabelText('Weight of set 1').props.maxLength).toBe(6);
    await fireEvent.changeText(screen.getByLabelText('Weight of set 1'), '5000');
    await fireEvent(screen.getByLabelText('Weight of set 1'), 'endEditing');
    expect(screen.getByLabelText('Weight of set 1').props.value).toBe('999.75');
    await fireEvent.changeText(screen.getByLabelText('Reps of set 1'), '1500');
    await fireEvent(screen.getByLabelText('Reps of set 1'), 'endEditing');
    expect(screen.getByLabelText('Reps of set 1').props.value).toBe('999');
  });

  it('closes the keyboard when a set is done', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    await render(<SessionScreen />);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Set 1 done' }));
    expect(dismiss).toHaveBeenCalled();
  });

  it('needs reps before a set is done, as the log would refuse it', async () => {
    await render(<SessionScreen />);
    await fireEvent.changeText(screen.getByLabelText('Reps of set 1'), '');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Set 1 done' }));
    expect(screen.getByRole('checkbox', { name: 'Set 1 done' })).not.toBeChecked();
    expect(screen.getByLabelText('Reps of set 1').props['aria-invalid']).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Reps of set 1'), '8');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Set 1 done' }));
    expect(screen.getByRole('checkbox', { name: 'Set 1 done' })).toBeChecked();
  });

  it('needs a weight before a set is done, and carries it to the next sets', async () => {
    resetSessionStore();
    startSession('user-a', PUSH, {}, { now: NOW.getTime() });
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
    startSession('user-a', PUSH, {}, { now: NOW.getTime() });
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
    // Digits alone read as on a clock.
    await fireEvent.changeText(screen.getByLabelText('Time of set 1'), '1111');
    await fireEvent(screen.getByLabelText('Time of set 1'), 'endEditing');
    expect(screen.getByLabelText('Time of set 1').props.value).toBe('11:11');
  });

  it('ticks a timed set whose time is typed by hand', async () => {
    await render(<SessionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Plank' }));
    expect(screen.queryByRole('checkbox', { name: 'Set 1 done' })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Time of set 1'), '0:45');
    await fireEvent(screen.getByLabelText('Time of set 1'), 'endEditing');
    expect(screen.queryByRole('button', { name: 'Start the clock of set 1' })).toBeNull();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Set 1 done' }));
    expect(screen.getByRole('checkbox', { name: 'Set 1 done' })).toBeChecked();
    expect(screen.getByLabelText('Time of set 1').props.value).toBe('0:45');
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

describe('new records', () => {
  const BESTS = { bench: { heaviest: 80, one_rep_max: 101.3, best_set: 640, most_reps: 10 } };
  const startWithBests = () => {
    resetSessionStore();
    startSession(
      'user-a',
      PUSH,
      { bench: [{ weightKg: 80, reps: 8, seconds: null, meters: null }] },
      { bests: BESTS, now: NOW.getTime() },
    );
  };

  it('shows the records a set beats under it while logging', async () => {
    startWithBests();
    await render(<SessionScreen />);
    await fireEvent.changeText(screen.getByLabelText('Weight of set 1'), '85');
    await fireEvent(screen.getByLabelText('Weight of set 1'), 'endEditing');
    await fireEvent.changeText(screen.getByLabelText('Reps of set 1'), '7');
    await fireEvent(screen.getByLabelText('Reps of set 1'), 'endEditing');
    expect(screen.queryByText(/^New record/)).toBeNull();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Set 1 done' }));
    expect(screen.getByText('New records: Heaviest, Est. 1RM')).toBeTruthy();
  });

  it('does not count equalling a record', async () => {
    startWithBests();
    await render(<SessionScreen />);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Set 1 done' }));
    expect(screen.queryByText(/^New record/)).toBeNull();
  });

  it('names one record with its value', async () => {
    startWithBests();
    updateSession((session) =>
      toggleDone(setValues(session, 0, 0, { weightKg: 85, reps: 1 }), 0, 0),
    );
    await render(<SessionScreen />);
    expect(screen.getByText('New record: Heaviest, 85 kg')).toBeTruthy();
  });

  it('lists the new records at the finish', async () => {
    startWithBests();
    updateSession((session) =>
      toggleDone(setValues(session, 0, 0, { weightKg: 85, reps: 7 }), 0, 0),
    );
    await render(<FinishScreen />);
    expect(screen.getByText('2 new records')).toBeTruthy();
    expect(screen.getByText('Bench press · Heaviest')).toBeTruthy();
    expect(screen.getByText('85 kg')).toBeTruthy();
    expect(screen.getByText('Bench press · Est. 1RM')).toBeTruthy();
    expect(screen.getByText('105 kg')).toBeTruthy();
  });
});

describe('FinishScreen', () => {
  const doFirstSet = () => updateSession((session) => toggleDone(session, 0, 0));

  it('names the best set, not the last one', async () => {
    updateSession((session) =>
      toggleDone(
        toggleDone(
          setValues(setValues(session, 0, 0, { weightKg: 85, reps: 5 }), 0, 1, {
            weightKg: 80,
            reps: 8,
          }),
          0,
          0,
        ),
        0,
        1,
      ),
    );
    await render(<FinishScreen />);
    expect(screen.getByText('2 sets · 85 kg × 5')).toBeTruthy();
  });

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

  it('ends a workout left open at its last set, and lets the end be changed', async () => {
    updateSession((session) => toggleDone(session, 0, 0, NOW.getTime() + 40 * 60_000));
    await act(async () => {
      jest.advanceTimersByTime(13 * 3600_000);
    });
    await render(<FinishScreen />);
    // 18:00 + 40 minutes.
    expect(screen.getByRole('button', { name: 'Ended at 6:40 PM. Change' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Ended at 6:40 PM. Change' }));
    expect(screen.getByText('When did you finish?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save workout' }));
    expect(logWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        finishedAt: new Date(NOW.getTime() + 40 * 60_000).toISOString(),
      }),
    );
  });

  it('keeps a running clock running when the workout goes on', async () => {
    updateSession((session) => startClock(session, 1, 0));
    await render(<FinishScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Keep going' }));
    const { result } = await renderHook(() => useActiveSession('user-a'));
    expect(result.current?.clock).toMatchObject({ exercise: 1, set: 0 });
    expect(result.current?.exercises[1]?.sets[0]?.done).toBe(false);
  });

  it('saves once when Save is tapped twice', async () => {
    doFirstSet();
    let finish: (id: number) => void = () => undefined;
    logWorkout.mockImplementationOnce(() => new Promise<number>((resolve) => (finish = resolve)));
    await render(<FinishScreen />);
    const save = screen.getByRole('button', { name: 'Save workout' });
    await fireEvent.press(save);
    await fireEvent.press(save);
    expect(logWorkout).toHaveBeenCalledTimes(1);
    await act(async () => finish(1));
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
