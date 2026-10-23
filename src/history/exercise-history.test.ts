import { supabase } from '@/lib/supabase';
import { createTestQueryClient, renderHook, waitFor } from '@/test/render';

import {
  bySession,
  recordSets,
  SESSION_LIMIT,
  useExerciseHistory,
  type ExerciseRecord,
  type ExerciseSession,
} from './exercise-history';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

const row = (
  logId: number,
  startedAt: string,
  setPosition: number,
  weightKg: number,
  reps: number,
  exercisePosition = 0,
) => ({
  log_id: logId,
  exercise_position: exercisePosition,
  set_position: setPosition,
  weight_kg: weightKg,
  reps,
  seconds: null,
  meters: null,
  workout_logs: { started_at: startedAt, name: null, type: 'push' as const },
});

const set = (weightKg: number, reps: number) => ({ weightKg, reps, seconds: null, meters: null });
const placed = (weightKg: number, reps: number, exercise: number, at: number) => ({
  ...set(weightKg, reps),
  place: { exercise, set: at },
});

beforeEach(() => jest.clearAllMocks());

describe('bySession', () => {
  it('groups the sets by workout, latest first, each in the order it was done', () => {
    const sessions = bySession([
      row(1, '2026-10-12T16:00:00Z', 1, 75, 7),
      row(2, '2026-10-23T16:00:00Z', 0, 80, 8),
      row(1, '2026-10-12T16:00:00Z', 0, 70, 10),
      // Done again later in the same workout.
      row(1, '2026-10-12T16:00:00Z', 0, 60, 12, 3),
    ]);
    expect(sessions.map((session) => session.logId)).toEqual([2, 1]);
    expect(sessions[1]).toEqual({
      logId: 1,
      startedAt: new Date('2026-10-12T16:00:00Z'),
      name: null,
      type: 'push',
      sets: [placed(70, 10, 0, 0), placed(75, 7, 0, 1), placed(60, 12, 3, 0)],
    });
  });
});

describe('recordSets', () => {
  // The same values twice; the record is the second one.
  const sessions: ExerciseSession[] = [
    {
      logId: 2,
      startedAt: new Date(),
      name: null,
      type: 'push',
      sets: [placed(85, 7, 0, 0), placed(85, 7, 0, 1)],
    },
    { logId: 1, startedAt: new Date(), name: null, type: 'push', sets: [placed(70, 10, 1, 0)] },
  ];
  const record = (
    kind: ExerciseRecord['kind'],
    logId: number,
    place: ExerciseRecord['place'],
  ): ExerciseRecord => ({
    kind,
    value: 0,
    set: set(0, 0),
    logId,
    achievedAt: new Date(),
    place,
  });

  it('marks the set in the place of each record', () => {
    expect(
      recordSets(
        [
          record('heaviest', 2, { exercise: 0, set: 1 }),
          record('one_rep_max', 2, { exercise: 0, set: 1 }),
          record('most_reps', 1, { exercise: 1, set: 0 }),
        ],
        sessions,
      ),
    ).toEqual(
      new Map([
        [2, new Set([1])],
        [1, new Set([0])],
      ]),
    );
  });

  it('marks no set for a record without a place, or of a workout not listed', () => {
    expect(
      recordSets(
        [record('most_time', 1, null), record('heaviest', 9, { exercise: 0, set: 0 })],
        sessions,
      ),
    ).toEqual(new Map());
  });
});

describe('useExerciseHistory', () => {
  it('reads the sets of the latest workouts only', async () => {
    const progressRow = (logId: number) => ({ log_id: logId, started_at: '2026-10-12T16:00:00Z' });
    jest.mocked(supabase.rpc).mockImplementation(((name: string) =>
      Promise.resolve({
        data:
          name === 'exercise_records'
            ? []
            : Array.from({ length: SESSION_LIMIT + 5 }, (_, index) => progressRow(index + 1)),
        error: null,
      })) as never);
    const inLogs = jest.fn().mockResolvedValue({ data: [], error: null });
    jest
      .mocked(supabase.from)
      .mockReturnValue({ select: () => ({ eq: () => ({ in: inLogs }) }) } as never);
    const { result } = await renderHook(() => useExerciseHistory('bench'), {
      queryClient: createTestQueryClient(),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const ids = inLogs.mock.calls[0]?.[1] as number[];
    expect(ids).toHaveLength(SESSION_LIMIT);
    expect(ids[0]).toBe(6);
    expect(result.current.data?.progress).toHaveLength(SESSION_LIMIT + 5);
  });

  it('loads the records in order, the progress and the sessions', async () => {
    jest.mocked(supabase.rpc).mockImplementation(((name: string) =>
      Promise.resolve(
        name === 'exercise_records'
          ? {
              data: [
                {
                  kind: 'most_reps',
                  value: 10,
                  weight_kg: 70,
                  reps: 10,
                  seconds: null,
                  meters: null,
                  log_id: 1,
                  achieved_at: '2026-10-12T16:00:00Z',
                  exercise_position: 0,
                  set_position: 0,
                },
                {
                  kind: 'heaviest',
                  value: 85,
                  weight_kg: 85,
                  reps: 7,
                  seconds: null,
                  meters: null,
                  log_id: 2,
                  achieved_at: '2026-10-23T16:00:00Z',
                  exercise_position: 1,
                  set_position: 2,
                },
              ],
              error: null,
            }
          : {
              data: [
                {
                  log_id: 1,
                  started_at: '2026-10-12T16:00:00Z',
                  heaviest_kg: 75,
                  one_rep_max_kg: 93.3,
                  volume_kg: 1225,
                  most_reps: 10,
                  total_reps: 17,
                  longest_seconds: null,
                  total_seconds: null,
                  longest_meters: null,
                  best_pace: null,
                },
              ],
              error: null,
            },
      )) as never);
    const inLogs = jest.fn().mockResolvedValue({
      data: [row(1, '2026-10-12T16:00:00Z', 0, 70, 10)],
      error: null,
    });
    const eq = jest.fn(() => ({ in: inLogs }));
    jest.mocked(supabase.from).mockReturnValue({ select: () => ({ eq }) } as never);

    const { result } = await renderHook(() => useExerciseHistory('bench'), {
      queryClient: createTestQueryClient(),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(supabase.rpc).toHaveBeenCalledWith('exercise_records', { exercise_id: 'bench' });
    expect(supabase.rpc).toHaveBeenCalledWith('exercise_progress', { exercise_id: 'bench' });
    expect(eq).toHaveBeenCalledWith('exercise_id', 'bench');
    // The sets of the listed workouts only.
    expect(inLogs).toHaveBeenCalledWith('log_id', [1]);
    const history = result.current.data!;
    expect(history.records.map((item) => item.kind)).toEqual(['heaviest', 'most_reps']);
    expect(history.records[0]).toEqual({
      kind: 'heaviest',
      value: 85,
      set: set(85, 7),
      logId: 2,
      achievedAt: new Date('2026-10-23T16:00:00Z'),
      place: { exercise: 1, set: 2 },
    });
    expect(history.progress[0]).toMatchObject({ logId: 1, heaviestKg: 75, longestSeconds: null });
    expect(history.sessions).toHaveLength(1);
  });

  it('fails when a part does not load', async () => {
    jest
      .mocked(supabase.rpc)
      .mockResolvedValue({ data: null, error: new Error('offline') } as never);
    jest.mocked(supabase.from).mockReturnValue({
      select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }),
    } as never);
    const { result } = await renderHook(() => useExerciseHistory('bench'), {
      queryClient: createTestQueryClient(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
