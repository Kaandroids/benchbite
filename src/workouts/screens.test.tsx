import { router } from 'expo-router';
import { Alert } from 'react-native';

import { endSession, useActiveSession, type Session } from '@/sessions/session';
import { useStartWorkout } from '@/sessions/start';
import { RecentLogs } from '@/history/recent-logs';
import { supabase } from '@/lib/supabase';
import { act, fireEvent, render, screen, waitFor } from '@/test/render';

import { useWorkoutAlternatives, type WorkoutAlternative } from './alternatives';
import { ArchiveScreen } from './archive-screen';
import { holdSwitches, testExercise, testWorkout, type HeldSwitch } from './test-data';
import { WorkoutScreen } from './workout-screen';
import {
  useCurrentWorkoutLimits,
  useSetWorkoutActive,
  useWorkoutLimits,
  useWorkouts,
  type Workout,
} from './workouts';
import { WorkoutsScreen } from './workouts-screen';

jest.mock('@/exercises/images', () => ({
  exerciseImageUrl: (path: string) => `https://images.test/${path}`,
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useScrollToTop: jest.fn(),
  useFocusEffect: jest.fn(),
}));
jest.mock('./workouts', () => ({
  ...jest.requireActual<typeof import('./workouts')>('./workouts'),
  useWorkouts: jest.fn(),
  useSetWorkoutActive: jest.fn(),
  useWorkoutLimits: jest.fn(),
  useCurrentWorkoutLimits: jest.fn(),
  useKcalPerMinute: () => ({ data: 7.5 }),
}));
jest.mock('./alternatives', () => ({
  ...jest.requireActual<typeof import('./alternatives')>('./alternatives'),
  useWorkoutAlternatives: jest.fn(),
}));
jest.mock('@/history/history', () => ({
  ...jest.requireActual<typeof import('@/history/history')>('@/history/history'),
  useRecentLogs: () => ({
    data: { latest: [], thisWeek: 0 },
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: () => {},
  }),
}));
jest.mock('@/sessions/start', () => ({
  ...jest.requireActual<typeof import('@/sessions/start')>('@/sessions/start'),
  useStartWorkout: jest.fn(),
}));
jest.mock('@/providers/session-provider', () => ({ useUserId: () => 'user-a' }));
jest.mock('@/sessions/session', () => ({
  ...jest.requireActual<typeof import('@/sessions/session')>('@/sessions/session'),
  useActiveSession: jest.fn(),
  endSession: jest.fn(),
}));
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/premium/plan', () => ({
  usePlanNumbers: () => ({
    data: {
      free: { workouts: 2, versions: 2, addedAlternatives: 1, weeklyPhotos: 2 },
      premium: { workouts: 500, versions: 5, addedAlternatives: null, weeklyPhotos: null },
    },
  }),
}));
jest.mock('@/exercises/library', () => ({
  ...jest.requireActual<typeof import('@/exercises/library')>('@/exercises/library'),
  useExerciseLibrary: () => ({
    data: ['pulldown', 'rope', 'row', 'bench', 'squat'].map((id) => ({
      id,
      name: `Name of ${id}`,
    })),
  }),
}));

const mutate = jest.fn();
const refetch = jest.fn();
let switches: HeldSwitch[] = [];
/** The alternatives switched to so far. */
const switched = () => switches.map((held) => held.alternativeId);

function mockAlternatives(data: WorkoutAlternative[]) {
  jest.mocked(useWorkoutAlternatives).mockReturnValue({ data } as never);
}

function mockWorkouts(data: Workout[] | undefined, state: { isError?: boolean } = {}) {
  jest.mocked(useWorkouts).mockReturnValue({
    data,
    isPending: data === undefined && !state.isError,
    isError: state.isError ?? false,
    isFetching: false,
    refetch,
  } as never);
}

// A Wednesday.
const WEDNESDAY = new Date(2026, 9, 21, 9, 0);

const startWorkout = jest.fn();

/** Push in progress for 23 minutes, with one of its two sets done. */
const RUNNING: Session = {
  userId: 'user-a',
  workoutId: 4,
  name: null,
  type: 'push',
  startedAt: Date.now(),
  exercises: [
    {
      exerciseId: 'bench',
      target: { reps: { min: 8, max: 12 } },
      restSeconds: 90,
      last: [],
      sets: [
        { weightKg: 80, reps: 8, seconds: null, meters: null, done: true },
        { weightKg: 80, reps: 8, seconds: null, meters: null, done: false },
      ],
    },
  ],
  current: 0,
  rest: null,
  clock: null,
  planned: { exercises: 1, sets: 2 },
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: WEDNESDAY, advanceTimers: true });
  jest.mocked(useSetWorkoutActive).mockReturnValue({ mutate } as never);
  jest.mocked(useStartWorkout).mockReturnValue(startWorkout);
  jest.mocked(useActiveSession).mockReturnValue(null);
  jest
    .mocked(useWorkoutLimits)
    .mockReturnValue({ data: { exercises: 20, workouts: 2, alternatives: 5 } } as never);
  jest
    .mocked(useCurrentWorkoutLimits)
    .mockReturnValue({ exercises: 20, workouts: 2, alternatives: 5 } as never);
  mockAlternatives([]);
  switches = holdSwitches(jest.mocked(supabase.rpc));
});
afterEach(() => jest.useRealTimers());

describe('WorkoutsScreen', () => {
  it('lists the active workouts with their days and size, today highlighted', async () => {
    mockWorkouts([
      testWorkout(1, { type: 'push', weekdays: [1] }),
      testWorkout(2, { type: 'pull', weekdays: [3, 6] }),
      testWorkout(3, { type: 'legs', weekdays: [] }),
      testWorkout(4, { type: 'upper', active: false }),
    ]);
    await render(<WorkoutsScreen />);
    expect(screen.getByText('Active · 3')).toBeTruthy();
    expect(screen.getByText('Push')).toBeTruthy();
    expect(screen.getByText('Wed')).toBeTruthy();
    expect(screen.getByText('Sat')).toBeTruthy();
    expect(screen.getByText('Any day')).toBeTruthy();
    // Each has one exercise of three sets, estimated at 45 minutes and 7.5 kcal a minute.
    expect(screen.getAllByLabelText('1 exercise')).toHaveLength(3);
    expect(screen.getAllByLabelText('3 sets')).toHaveLength(3);
    expect(screen.getAllByText('~45 min')).toHaveLength(3);
    expect(screen.getAllByText('~338 kcal')).toHaveLength(3);
    // Only the workout on Wednesday is today's, whose day stands out.
    expect(screen.getAllByLabelText('Wed, today')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Pull, today' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Push' })).toBeTruthy();
    // Inactive workouts are in the archive.
    expect(screen.queryByText('Upper body')).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Start / })).toHaveLength(3);
  });

  it('shows the empty history until workouts can be logged', async () => {
    mockWorkouts([testWorkout(1)]);
    await render(<WorkoutsScreen history={<RecentLogs />} />);
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('Your finished workouts will show here.')).toBeTruthy();
  });

  it('says when no workout is active', async () => {
    mockWorkouts([testWorkout(1, { active: false })]);
    await render(<WorkoutsScreen />);
    expect(screen.getByText('Active · 0')).toBeTruthy();
    expect(screen.getByText('No active workouts. Switch one on in the archive.')).toBeTruthy();
  });

  it('opens a workout and the archive', async () => {
    mockWorkouts([testWorkout(5, { type: 'pull' })]);
    await render(<WorkoutsScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Pull' }));
    expect(router.push).toHaveBeenCalledWith(
      { pathname: '/workout/[id]', params: { id: '5' } },
      { withAnchor: true },
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Archive' }));
    expect(router.push).toHaveBeenCalledWith('/workout/archive');
    await fireEvent.press(screen.getByRole('button', { name: 'New workout' }));
    expect(router.push).toHaveBeenCalledWith('/workout/edit');
  });

  it('says to add a workout, not to switch one on, on a plan without the archive', async () => {
    jest.mocked(useWorkoutLimits).mockReturnValue({
      data: { exercises: 20, workouts: 2, alternatives: 5, archive: false, workouts_counted: 0 },
    } as never);
    mockWorkouts([testWorkout(5, { active: false })]);
    await render(<WorkoutsScreen />);
    expect(screen.getByText('No active workouts. Add one to get started.')).toBeTruthy();
  });

  it('offers a new workout when the archive does not count, as the limits say', async () => {
    jest.mocked(useWorkoutLimits).mockReturnValue({
      data: { exercises: 20, workouts: 2, alternatives: 5, archive: false, workouts_counted: 0 },
    } as never);
    mockWorkouts([testWorkout(5, { active: false }), testWorkout(6, { active: false })]);
    await render(<WorkoutsScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'New workout' }));
    expect(router.push).toHaveBeenCalledWith('/workout/edit');
  });

  it('offers premium when there is no room for another workout, counting the archive', async () => {
    jest.mocked(useWorkoutLimits).mockReturnValue({
      data: { exercises: 20, workouts: 2, alternatives: 5, workouts_counted: 2 },
    } as never);
    mockWorkouts([testWorkout(5, { type: 'pull' }), testWorkout(6, { active: false })]);
    await render(<WorkoutsScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'New workout' }));
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByText('You have 2 of 2 workouts')).toBeTruthy();
    expect(
      screen.getByText(
        'Premium has room for 500, with 5 alternatives each. Or delete one to make room.',
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'See premium' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/premium'));
  });

  it('closes the offer without opening premium', async () => {
    jest.mocked(useWorkoutLimits).mockReturnValue({
      data: { exercises: 20, workouts: 2, alternatives: 5, workouts_counted: 2 },
    } as never);
    mockWorkouts([testWorkout(5, { type: 'pull' }), testWorkout(6, { active: false })]);
    await render(<WorkoutsScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'New workout' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(screen.queryByText('You have 2 of 2 workouts')).toBeNull());
    expect(router.push).not.toHaveBeenCalled();
  });

  it('says only that there is no room on premium, which has no more to offer', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    jest.mocked(useWorkoutLimits).mockReturnValue({
      data: { exercises: 20, workouts: 500, alternatives: 5, workouts_counted: 500 },
    } as never);
    mockWorkouts(Array.from({ length: 500 }, (_, i) => testWorkout(i + 1, { active: false })));
    await render(<WorkoutsScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'New workout' }));
    expect(alert).toHaveBeenCalledWith(
      'No room for another workout',
      'You can have up to 500 workouts. Delete one to make room.',
    );
  });

  it('offers to start active workouts instead of switching them off', async () => {
    mockWorkouts([testWorkout(5, { type: 'pull' })]);
    await render(<WorkoutsScreen />);
    expect(screen.queryByLabelText('Pull is active')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Start Pull' }));
    expect(startWorkout).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }));
  });

  it('shows a workout without exercises as such, and opens it instead of starting it', async () => {
    mockWorkouts([testWorkout(5, { type: 'pull', exercises: [] })]);
    await render(<WorkoutsScreen />);
    expect(screen.getByText('No exercises yet')).toBeTruthy();
    expect(screen.queryByText('~45 min')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Start Pull' }));
    expect(startWorkout).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith(
      { pathname: '/workout/[id]', params: { id: '5' } },
      { withAnchor: true },
    );
  });

  describe('with workouts that wait for premium', () => {
    const waiting = [
      testWorkout(1, { type: 'push' }),
      testWorkout(2, { name: 'Core', held: true }),
      testWorkout(3, { name: 'Cardio', active: false, held: true }),
    ];

    it('locks them in their place, under a banner that does not count the archived one', async () => {
      mockWorkouts(waiting);
      await render(<WorkoutsScreen />);
      expect(screen.getByText('1 workout waits for premium.')).toBeTruthy();
      expect(screen.getByText('Active · 2')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Start Push' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Start Core' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Core, waits for premium' })).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: /^1 workout waits/ }));
      expect(router.push).toHaveBeenCalledWith('/premium');
    });

    it('shows no banner while none waits', async () => {
      mockWorkouts([testWorkout(1)]);
      await render(<WorkoutsScreen />);
      expect(screen.queryByText(/wait for premium/)).toBeNull();
    });

    it('keeps one running as it is, to be resumed rather than deleted from a sheet', async () => {
      jest.mocked(useActiveSession).mockReturnValue({ ...RUNNING, workoutId: 2 });
      mockWorkouts(waiting);
      await render(<WorkoutsScreen />);
      expect(screen.getAllByText('Running').length).toBeGreaterThan(0);
      // Nothing else active waits, and the archive says of itself what waits there.
      expect(screen.queryByText(/waits? for premium\./)).toBeNull();
      await fireEvent.press(screen.getByRole('button', { name: 'Core' }));
      expect(screen.queryByText('Core waits for premium')).toBeNull();
      expect(router.push).toHaveBeenCalledWith(
        { pathname: '/workout/[id]', params: { id: '2' } },
        { withAnchor: true },
      );
    });

    it('opens a sheet for one, which offers premium, its exercises and a delete', async () => {
      const alert = jest.spyOn(Alert, 'alert');
      mockWorkouts(waiting);
      await render(<WorkoutsScreen />);
      await fireEvent.press(screen.getByRole('button', { name: 'Core, waits for premium' }));
      expect(router.push).not.toHaveBeenCalled();
      expect(screen.getByText('Core waits for premium')).toBeTruthy();
      expect(screen.getByText(/Your plan has room for 2 workouts/)).toBeTruthy();

      await fireEvent.press(screen.getByRole('button', { name: 'See its exercises' }));
      await waitFor(() =>
        expect(router.push).toHaveBeenCalledWith(
          { pathname: '/workout/[id]', params: { id: '2' } },
          { withAnchor: true },
        ),
      );

      await fireEvent.press(screen.getByRole('button', { name: 'Core, waits for premium' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Delete it to make room' }));
      await waitFor(() =>
        expect(alert).toHaveBeenCalledWith(
          'Delete this workout?',
          expect.any(String),
          expect.any(Array),
        ),
      );

      await fireEvent.press(screen.getByRole('button', { name: 'Core, waits for premium' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Get it back with premium' }));
      await waitFor(() => expect(router.push).toHaveBeenCalledWith('/premium'));
    });
  });

  describe('with a workout in progress', () => {
    beforeEach(() => {
      jest
        .mocked(useActiveSession)
        .mockReturnValue({ ...RUNNING, startedAt: Date.now() - 23 * 60_000 });
      mockWorkouts([testWorkout(4, { type: 'push' }), testWorkout(5, { type: 'pull' })]);
    });

    it('shows it at the top and opens it again', async () => {
      await render(<WorkoutsScreen />);
      expect(screen.getByText('IN PROGRESS')).toBeTruthy();
      expect(screen.getByText('23:00')).toBeTruthy();
      expect(screen.getByText('Running')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Start Push' })).toBeNull();
      await fireEvent.press(screen.getByRole('button', { name: 'IN PROGRESS: Push' }));
      expect(router.push).toHaveBeenCalledWith('/session');
    });

    it('asks before starting another one', async () => {
      await render(<WorkoutsScreen />);
      await fireEvent.press(screen.getByRole('button', { name: 'Start Pull' }));
      expect(startWorkout).not.toHaveBeenCalled();
      expect(screen.getByText('Push is still running')).toBeTruthy();
      expect(
        screen.getByText(
          'You started it 23 min ago and logged 1 set. Only one workout can run at a time.',
        ),
      ).toBeTruthy();

      await fireEvent.press(screen.getByRole('button', { name: 'Finish Push, then start Pull' }));
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/session/finish',
        params: { next: '5' },
      });

      await fireEvent.press(screen.getByRole('button', { name: 'Start Pull' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Discard Push and start Pull' }));
      // The running workout ends only once Pull is sure to start, after any question about it.
      expect(endSession).not.toHaveBeenCalled();
      // It starts once the sheet has closed, as iOS cannot open the question before.
      await waitFor(() =>
        expect(startWorkout).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }), {
          beforeStart: expect.any(Function),
        }),
      );
      // Which ends Push without saving it.
      jest.mocked(startWorkout).mock.calls[0]![1]!.beforeStart!();
      expect(endSession).toHaveBeenCalledWith({ saved: false });
    });

    it('goes back to it from the question', async () => {
      await render(<WorkoutsScreen />);
      await fireEvent.press(screen.getByRole('button', { name: 'Start Pull' }));
      await act(async () => {
        await fireEvent.press(screen.getByRole('button', { name: 'Resume Push' }));
      });
      expect(router.push).toHaveBeenCalledWith('/session');
    });
  });

  it('shows an error with a retry', async () => {
    mockWorkouts(undefined, { isError: true });
    await render(<WorkoutsScreen />);
    expect(screen.getByText("This couldn't load")).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows a spinner while loading', async () => {
    mockWorkouts(undefined);
    await render(<WorkoutsScreen />);
    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });
});

describe('ArchiveScreen', () => {
  it('lists only the inactive workouts, which can be switched on', async () => {
    mockWorkouts([
      testWorkout(1, { type: 'push' }),
      testWorkout(2, { type: 'upper', active: false }),
    ]);
    await render(<ArchiveScreen />);
    expect(screen.queryByText('Push')).toBeNull();
    // Inactive workouts cannot be started.
    expect(screen.queryByRole('button', { name: /^Start / })).toBeNull();
    await fireEvent(screen.getByLabelText('Upper body is active'), 'valueChange', true);
    expect(mutate).toHaveBeenCalledWith({ id: 2, active: true });
  });

  it('locks one that waits for premium instead of offering to switch it on', async () => {
    mockWorkouts([testWorkout(2, { name: 'Cardio', active: false, held: true })]);
    await render(<ArchiveScreen />);
    expect(screen.queryByLabelText('Cardio is active')).toBeNull();
    expect(screen.getByRole('button', { name: 'Cardio, waits for premium' })).toBeTruthy();
  });

  it('shows one running as running, though it waits for premium', async () => {
    jest.mocked(useActiveSession).mockReturnValue({ ...RUNNING, workoutId: 2 });
    mockWorkouts([testWorkout(2, { name: 'Cardio', active: false, held: true })]);
    await render(<ArchiveScreen />);
    expect(screen.getByText('Running')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cardio, waits for premium' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Cardio' }));
    expect(screen.queryByText('Cardio waits for premium')).toBeNull();
  });

  describe('with workouts that wait in it', () => {
    it('shows them to look at, opening one rather than a sheet, with a way to premium', async () => {
      mockWorkouts([testWorkout(2, { name: 'Cardio', active: false, held: true })]);
      await render(<ArchiveScreen />);
      expect(screen.getByText(/They don't count toward your workouts/)).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: 'Cardio, waits for premium' }));
      expect(screen.queryByText('Cardio waits for premium')).toBeNull();
      expect(router.push).toHaveBeenCalledWith(
        { pathname: '/workout/[id]', params: { id: '2' } },
        { withAnchor: true },
      );
      await fireEvent.press(screen.getByRole('button', { name: 'See premium' }));
      expect(router.push).toHaveBeenLastCalledWith('/premium');
    });

    it('says nothing of premium over rows still to switch on, as a plan just ended', async () => {
      mockWorkouts([testWorkout(2, { name: 'Cardio', active: false })]);
      await render(<ArchiveScreen />);
      expect(screen.queryByText(/They don't count toward your workouts/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'See premium' })).toBeNull();
    });

    it('says nothing of premium when it is empty', async () => {
      mockWorkouts([testWorkout(1)]);
      await render(<ArchiveScreen />);
      expect(screen.queryByText(/They don't count toward your workouts/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'See premium' })).toBeNull();
    });
  });

  it('says when the archive is empty, and goes back', async () => {
    mockWorkouts([testWorkout(1)]);
    await render(<ArchiveScreen />);
    expect(screen.getByText('No archived workouts.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(router.back).toHaveBeenCalled();
  });
});

describe('WorkoutScreen', () => {
  const pull = testWorkout(7, {
    type: 'pull',
    weekdays: [3],
    estimatedMinutes: 50,
    exercises: [
      testExercise('pulldown', { primaryMuscles: ['lats'] }),
      testExercise('row', { sets: 4, primaryMuscles: ['middle back', 'lats'], restSeconds: 75 }),
      testExercise('curl', {
        sets: 2,
        primaryMuscles: ['biceps'],
        target: { reps: { min: 10, max: 10 } },
      }),
      testExercise('rope', {
        target: { seconds: 45, meters: null },
        restSeconds: 30,
        primaryMuscles: ['calves'],
      }),
    ],
  });

  it('shows the workout with its days, muscles and size', async () => {
    mockWorkouts([pull]);
    await render(<WorkoutScreen id={7} />);
    expect(screen.getByText('Pull')).toBeTruthy();
    expect(screen.getByText('Wed')).toBeTruthy();
    expect(screen.getByText('Lats · Middle back · Biceps')).toBeTruthy();
    // The rope's conditioning counts like any exercise.
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('exercises')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('sets')).toBeTruthy();
    expect(screen.getByText('~50')).toBeTruthy();
  });

  it('lists each exercise with its name, target and rest', async () => {
    mockWorkouts([pull]);
    await render(<WorkoutScreen id={7} />);
    await waitFor(() => expect(screen.getByText('Name of pulldown')).toBeTruthy());
    expect(screen.getByText('4 × 8–12 reps')).toBeTruthy();
    expect(screen.getByText('Rest 1:15')).toBeTruthy();
    expect(screen.getByText('2 × 10 reps')).toBeTruthy();
    expect(screen.getByText('Name of rope')).toBeTruthy();
    expect(screen.getByText('3 × 45 s')).toBeTruthy();
    expect(screen.getByText('Rest 0:30')).toBeTruthy();
  });

  it('shows the exercise pictures', async () => {
    mockWorkouts([pull]);
    await render(<WorkoutScreen id={7} />);
    const sources = screen.container
      .queryAll((node) => node.type === 'Image')
      .map((node) => node.props.source?.uri);
    expect(sources).toContain('https://images.test/pulldown/0.webp');
    expect(sources).toContain('https://images.test/rope/0.webp');
  });

  it('opens the editor and each exercise’s details', async () => {
    mockWorkouts([pull]);
    await render(<WorkoutScreen id={7} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/workout/edit', params: { id: '7' } });
    await waitFor(() => expect(screen.getByText('Name of row')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Details of Name of row' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/workout/exercise/[id]',
      params: { id: 'row' },
    });
  });

  it('starts the workout, or resumes it while it runs', async () => {
    mockWorkouts([pull]);
    await render(<WorkoutScreen id={7} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Start workout' }));
    expect(startWorkout).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));

    jest.mocked(useActiveSession).mockReturnValue({ ...RUNNING, workoutId: 7 });
    await render(<WorkoutScreen id={7} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Resume' }));
    expect(router.push).toHaveBeenCalledWith('/session');
  });

  it('asks before deleting the workout, and not while it runs', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    mockWorkouts([pull]);
    await render(<WorkoutScreen id={7} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Delete workout' }));
    expect(alert.mock.calls[0]?.[0]).toBe('Delete this workout?');

    jest.mocked(useActiveSession).mockReturnValue({ ...RUNNING, workoutId: 7 });
    await render(<WorkoutScreen id={7} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Delete workout' }));
    expect(alert.mock.calls[1]?.[0]).toBe('Pull is running');
  });

  it('cannot be edited while it is running, and goes back to it instead', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    jest.mocked(useActiveSession).mockReturnValue({ ...RUNNING, workoutId: 7 });
    mockWorkouts([pull]);
    await render(<WorkoutScreen id={7} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(router.push).not.toHaveBeenCalled();
    expect(alert.mock.calls[0]?.slice(0, 2)).toEqual([
      'Pull is running',
      'Finish the workout before changing it.',
    ]);
    const resume = alert.mock.calls[0]?.[2]?.find(
      (button) => button.text === 'Back to the workout',
    );
    resume?.onPress?.();
    expect(router.push).toHaveBeenCalledWith('/session');
  });

  it('moves the workout to the archive, and back', async () => {
    mockWorkouts([pull]);
    await render(<WorkoutScreen id={7} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Move to archive' }));
    expect(mutate).toHaveBeenCalledWith({ id: 7, active: false }, expect.anything());

    mockWorkouts([{ ...pull, active: false }]);
    await render(<WorkoutScreen id={7} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Bring back from the archive' }));
    expect(mutate).toHaveBeenCalledWith({ id: 7, active: true }, expect.anything());
  });

  describe('on a plan without the archive', () => {
    beforeEach(() => {
      jest.mocked(useCurrentWorkoutLimits).mockReturnValue({
        exercises: 20,
        workouts: 2,
        alternatives: 5,
        archive: false,
      } as never);
    });

    it('offers premium in place of moving the workout to the archive', async () => {
      mockWorkouts([pull]);
      await render(<WorkoutScreen id={7} />);
      await fireEvent.press(screen.getByRole('button', { name: /^Move to archive/ }));
      expect(mutate).not.toHaveBeenCalled();
      expect(screen.getByText('The archive comes with premium')).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: 'See premium' }));
      await waitFor(() => expect(router.push).toHaveBeenCalledWith('/premium'));
    });

    it('shows an archived workout to look at, with a way to premium and a delete', async () => {
      const alert = jest.spyOn(Alert, 'alert');
      mockWorkouts([{ ...pull, active: false, held: true }]);
      await render(<WorkoutScreen id={7} />);
      expect(screen.getByText('In your archive')).toBeTruthy();
      expect(screen.getByText('Name of pulldown')).toBeTruthy();
      expect(screen.queryByText(/Your plan has room/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
      expect(screen.queryByRole('button', { name: /from the archive/ })).toBeNull();
      await fireEvent.press(screen.getByRole('button', { name: 'Bring it back with premium' }));
      expect(router.push).toHaveBeenLastCalledWith('/premium');
      await fireEvent.press(screen.getByRole('button', { name: 'Delete workout' }));
      expect(alert.mock.lastCall?.[0]).toBe('Delete this workout?');
    });
  });

  it('asks the server while the plan is read, so that a new plan is not held back', async () => {
    jest.mocked(useCurrentWorkoutLimits).mockReturnValue(undefined as never);
    mockWorkouts([pull]);
    await render(<WorkoutScreen id={7} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Move to archive' }));
    expect(mutate).toHaveBeenCalledWith({ id: 7, active: false }, expect.anything());
    expect(screen.queryByText('The archive comes with premium')).toBeNull();
  });

  it('offers premium when the server refuses the archive, as the plan may have ended', async () => {
    mutate.mockImplementationOnce((_variables, options) => options.onError({ code: 'BB054' }));
    mockWorkouts([pull]);
    await render(<WorkoutScreen id={7} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Move to archive' }));
    expect(await screen.findByText('The archive comes with premium')).toBeTruthy();
  });

  it('offers premium instead of Start, editing, alternatives and the archive while it waits', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    mockWorkouts([{ ...pull, held: true }]);
    mockAlternatives([
      { id: 3, position: 1, name: 'Gym', inUse: true, held: false, exerciseCount: null },
      { id: 5, position: 2, name: 'Home', inUse: false, held: false, exerciseCount: 2 },
    ]);
    await render(<WorkoutScreen id={7} />);
    expect(screen.getByLabelText('Waits for premium')).toBeTruthy();
    expect(screen.getByText('Your plan has room for 2 workouts.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start workout' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Alternatives' })).toBeNull();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Move to archive' })).toBeNull();
    // Its exercises can still be looked at.
    expect(screen.getByText('Name of pulldown')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Train it with premium' }));
    expect(router.push).toHaveBeenLastCalledWith('/premium');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete workout' }));
    expect(alert.mock.lastCall?.[0]).toBe('Delete this workout?');
  });

  it('resumes a running workout that waits for premium, and asks to finish it before a delete', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    jest.mocked(useActiveSession).mockReturnValue({ ...RUNNING, workoutId: 7 });
    mockWorkouts([{ ...pull, held: true }]);
    await render(<WorkoutScreen id={7} />);
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Train it with premium' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move to archive' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete workout' }));
    expect(alert.mock.calls[0]?.[0]).toBe('Pull is running');
  });

  describe('with alternatives', () => {
    const gymHomeHotel: WorkoutAlternative[] = [
      { id: 3, position: 1, name: 'Gym', inUse: false, held: false, exerciseCount: 4 },
      { id: 5, position: 2, name: null, inUse: true, held: false, exerciseCount: null },
      { id: 6, position: 3, name: 'Hotel', inUse: false, held: false, exerciseCount: 2 },
    ];

    it('opens them from the top bar, with one set of exercises too', async () => {
      mockWorkouts([pull]);
      await render(<WorkoutScreen id={7} />);
      await fireEvent.press(screen.getByRole('button', { name: 'Alternatives' }));
      expect(screen.getByText('Add alternative')).toBeTruthy();
      expect(screen.getByRole('radio', { name: 'Alternative 1', checked: true })).toBeTruthy();
      expect(screen.getByText('4 exercises')).toBeTruthy();
    });

    it('opens a sheet for one that waits for premium instead of putting it in use', async () => {
      mockWorkouts([pull]);
      mockAlternatives([
        { id: 3, position: 1, name: 'Gym', inUse: true, held: false, exerciseCount: null },
        { id: 5, position: 2, name: 'Knee-safe', inUse: false, held: true, exerciseCount: 2 },
      ]);
      await render(<WorkoutScreen id={7} />);
      await fireEvent.press(screen.getByRole('tab', { name: 'Knee-safe' }));
      expect(switched()).toEqual([]);
      expect(screen.getByText('Knee-safe waits for premium')).toBeTruthy();
      expect(screen.getByText(/as it was/)).toBeTruthy();

      await fireEvent.press(screen.getByRole('button', { name: 'Manage alternatives' }));
      await waitFor(() => expect(screen.getByText('Add alternative')).toBeTruthy());

      await fireEvent.press(screen.getByRole('tab', { name: 'Knee-safe' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Get it back with premium' }));
      await waitFor(() => expect(router.push).toHaveBeenCalledWith('/premium'));
    });

    it('shows no chips for a workout without alternatives', async () => {
      mockWorkouts([pull]);
      await render(<WorkoutScreen id={7} />);
      expect(screen.queryAllByRole('tab')).toHaveLength(0);
    });

    it('shows them in order by name, the one in use chosen', async () => {
      mockWorkouts([pull]);
      mockAlternatives(gymHomeHotel);
      await render(<WorkoutScreen id={7} />);
      const tabs = screen.getAllByRole('tab');
      expect(tabs.map((tab) => tab.props.accessibilityState?.selected)).toEqual([
        false,
        true,
        false,
      ]);
      expect(screen.getByRole('tab', { name: 'Gym' })).toBeTruthy();
      expect(screen.getByRole('tab', { name: 'Alternative 2', selected: true })).toBeTruthy();
      expect(screen.getByRole('tab', { name: 'Hotel' })).toBeTruthy();
    });

    it('puts another in use, and not the one already in use', async () => {
      mockWorkouts([pull]);
      mockAlternatives(gymHomeHotel);
      await render(<WorkoutScreen id={7} />);
      await fireEvent.press(screen.getByRole('tab', { name: 'Alternative 2' }));
      expect(switched()).toEqual([]);
      await fireEvent.press(screen.getByRole('tab', { name: 'Hotel' }));
      expect(switched()).toEqual([6]);
    });

    it('shows the one being switched to as chosen meanwhile, and Start off', async () => {
      mockWorkouts([pull]);
      mockAlternatives(gymHomeHotel);
      await render(<WorkoutScreen id={7} />);
      await fireEvent.press(screen.getByRole('tab', { name: 'Hotel' }));
      await waitFor(() =>
        expect(screen.getByRole('tab', { name: 'Hotel', selected: true })).toBeTruthy(),
      );
      await fireEvent.press(screen.getByRole('tab', { name: 'Gym' }));
      expect(switched()).toEqual([6]);
      // Not with the exercises Hotel is about to replace.
      const start = screen.getByRole('button', { name: 'Start workout' });
      expect(start.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
      await fireEvent.press(start);
      expect(startWorkout).not.toHaveBeenCalled();

      await act(async () => switches[0]?.succeed());
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Start workout' }).props.accessibilityState,
        ).toEqual(expect.objectContaining({ disabled: false })),
      );
    });

    it('keeps Start off while the sheet puts another in use', async () => {
      mockWorkouts([pull]);
      mockAlternatives(gymHomeHotel);
      await render(<WorkoutScreen id={7} />);
      await fireEvent.press(screen.getByRole('button', { name: 'Alternatives' }));
      await fireEvent.press(screen.getByRole('radio', { name: 'Gym' }));
      expect(switched()).toEqual([3]);
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Start workout' }).props.accessibilityState,
        ).toEqual(expect.objectContaining({ disabled: true })),
      );
    });

    it('says why a switch failed', async () => {
      mockWorkouts([pull]);
      mockAlternatives(gymHomeHotel);
      await render(<WorkoutScreen id={7} />);
      await fireEvent.press(screen.getByRole('tab', { name: 'Hotel' }));
      await act(async () => switches[0]?.fail({ code: 'P0002' }));
      expect(screen.getByText('This alternative no longer exists.')).toBeTruthy();
    });

    it('does not switch while the workout runs', async () => {
      const alert = jest.spyOn(Alert, 'alert');
      jest.mocked(useActiveSession).mockReturnValue({ ...RUNNING, workoutId: 7 });
      mockWorkouts([pull]);
      mockAlternatives(gymHomeHotel);
      await render(<WorkoutScreen id={7} />);
      await fireEvent.press(screen.getByRole('tab', { name: 'Gym' }));
      expect(switched()).toEqual([]);
      expect(alert.mock.calls[0]?.[0]).toBe('Pull is running');
    });

    it('closes the sheet before asking to finish the running workout', async () => {
      const alert = jest.spyOn(Alert, 'alert');
      jest.mocked(useActiveSession).mockReturnValue({ ...RUNNING, workoutId: 7 });
      mockWorkouts([pull]);
      mockAlternatives(gymHomeHotel);
      await render(<WorkoutScreen id={7} />);
      await fireEvent.press(screen.getByRole('button', { name: 'Alternatives' }));
      await fireEvent.press(screen.getByRole('radio', { name: 'Gym' }));
      expect(switched()).toEqual([]);
      expect(screen.queryByRole('radio', { name: 'Gym' })).toBeNull();
      // Once the sheet has closed, as iOS shows no alert over a closing sheet.
      await waitFor(() => expect(alert.mock.calls[0]?.[0]).toBe('Pull is running'));
    });
  });

  describe('without exercises', () => {
    const empty = { ...pull, exercises: [] };

    it('offers no way to add exercises while it waits for premium', async () => {
      mockWorkouts([{ ...pull, exercises: [], held: true }]);
      await render(<WorkoutScreen id={7} />);
      expect(screen.getByText('Pull has no exercises yet')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Add exercises' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Train it with premium' })).toBeTruthy();
    });

    it('says so in place of its exercises, and leads to Edit', async () => {
      mockWorkouts([empty]);
      mockAlternatives([
        { id: 3, position: 1, name: 'Gym', inUse: false, held: false, exerciseCount: 4 },
        { id: 5, position: 2, name: 'Home', inUse: true, held: false, exerciseCount: null },
      ]);
      await render(<WorkoutScreen id={7} />);
      expect(screen.getByText('No exercises yet')).toBeTruthy();
      expect(screen.getByText('Home has no exercises yet')).toBeTruthy();
      expect(screen.getByText('Add the exercises for Home. Gym stays as it is.')).toBeTruthy();
      expect(screen.queryByText('~50')).toBeNull();
      await fireEvent.press(screen.getByRole('button', { name: 'Add exercises' }));
      expect(router.push).toHaveBeenCalledWith({ pathname: '/workout/edit', params: { id: '7' } });
    });

    it('cannot be started until it has an exercise', async () => {
      mockWorkouts([empty]);
      await render(<WorkoutScreen id={7} />);
      const start = screen.getByRole('button', { name: 'Start workout' });
      expect(start.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
      await fireEvent.press(start);
      expect(startWorkout).not.toHaveBeenCalled();
      expect(screen.getByText('Add an exercise to start.')).toBeTruthy();
    });

    it('names the workout itself without alternatives, and the others with several', async () => {
      mockWorkouts([empty]);
      await render(<WorkoutScreen id={7} />);
      expect(screen.getByText('Pull has no exercises yet')).toBeTruthy();
      expect(screen.getByText('Add the exercises for this workout to start it.')).toBeTruthy();

      mockAlternatives([
        { id: 3, position: 1, name: 'Gym', inUse: false, held: false, exerciseCount: 4 },
        { id: 5, position: 2, name: null, inUse: true, held: false, exerciseCount: null },
        { id: 6, position: 3, name: 'Hotel', inUse: false, held: false, exerciseCount: 2 },
      ]);
      await render(<WorkoutScreen id={7} />);
      expect(
        screen.getByText(
          'Add the exercises for Alternative 2. The other alternatives stay as they are.',
        ),
      ).toBeTruthy();
    });
  });

  it('says when the workout does not exist', async () => {
    mockWorkouts([pull]);
    await render(<WorkoutScreen id={99} />);
    expect(screen.getByText('Workout not found')).toBeTruthy();
  });
});
