import { supabase } from '@/lib/supabase';
import { act, createTestQueryClient, renderHook, waitFor } from '@/test/render';

import { longestRun, NO_STREAK } from './streak';
import { sampleStreak } from './sample-streak';
import { showSampleStreak, useMonthStreak, useStreak } from './use-streak';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

// A Thursday.
const THURSDAY = new Date(2026, 9, 22, 9, 0);

/** The streak and this week's states as the database returns them. */
function mockStreak() {
  jest.mocked(supabase.rpc).mockImplementation(((name: string) =>
    name === 'streak'
      ? {
          single: () =>
            Promise.resolve({
              data: { count: 3, counted_today: true, freezes: 3, missed: [], saved_count: 3 },
              error: null,
            }),
        }
      : Promise.resolve({
          data: [
            { day: '2026-10-19', state: 'done' },
            { day: '2026-10-20', state: 'frozen' },
            { day: '2026-10-21', state: 'missed' },
            { day: '2026-10-22', state: 'done' },
          ],
          error: null,
        })) as never);
}

describe('useStreak', () => {
  afterEach(() => showSampleStreak(null));

  it('reads the streak on the device’s today, with this week’s done and frozen days', async () => {
    mockStreak();
    const { result } = await renderHook(() => useStreak(THURSDAY).streak);
    expect(result.current).toEqual(NO_STREAK);
    await waitFor(() =>
      expect(result.current).toEqual({
        count: 3,
        doneToday: true,
        days: { '2026-10-19': 'done', '2026-10-20': 'frozen', '2026-10-22': 'done' },
      }),
    );
    expect(supabase.rpc).toHaveBeenCalledWith('streak', { today: '2026-10-22' });
    expect(supabase.rpc).toHaveBeenCalledWith('streak_states', {
      from_day: '2026-10-19',
      to_day: '2026-10-25',
      today: '2026-10-22',
    });
  });

  it('reads the freezes the user has', async () => {
    mockStreak();
    // Not checked before it loads: the mocked load can finish before the first render is read.
    const { result } = await renderHook(() => useStreak(THURSDAY).freezes);
    await waitFor(() => expect(result.current).toBe(3));
  });

  it('shows none when it cannot load, and can be tried again', async () => {
    const failed = { data: null, error: new Error('offline') };
    jest
      .mocked(supabase.rpc)
      .mockImplementation(((name: string) =>
        name === 'streak'
          ? { single: () => Promise.resolve(failed) }
          : Promise.resolve(failed)) as never);
    const { result } = await renderHook(() => useStreak(THURSDAY), {
      queryClient: createTestQueryClient(),
    });
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.streak).toEqual(NO_STREAK);

    mockStreak();
    await act(() => result.current.retry());
    await waitFor(() => expect(result.current.streak.count).toBe(3));
  });

  it('shows a sample streak and goes back to the user’s', async () => {
    mockStreak();
    const { result } = await renderHook(() => useStreak(THURSDAY).streak);
    const sample = sampleStreak(THURSDAY, true);
    await act(() => showSampleStreak(sample));
    expect(result.current).toBe(sample);
    await act(() => showSampleStreak(null));
    await waitFor(() => expect(result.current.count).toBe(3));
  });
});

describe('sampleStreak', () => {
  it('runs up to yesterday with a frozen day', () => {
    expect(sampleStreak(THURSDAY, false)).toEqual({
      count: 4,
      doneToday: false,
      days: {
        '2026-10-18': 'done',
        '2026-10-19': 'done',
        '2026-10-20': 'frozen',
        '2026-10-21': 'done',
      },
    });
  });

  it('counts today once it is done', () => {
    expect(sampleStreak(THURSDAY, true).count).toBe(5);
  });
});

describe('useMonthStreak', () => {
  it('reads how each day of the month went, missed and open ones too', async () => {
    mockStreak();
    const { result } = await renderHook(() => useMonthStreak(THURSDAY, new Date(2026, 9, 5)));
    await waitFor(() =>
      expect(result.current.data).toEqual({
        '2026-10-19': 'done',
        '2026-10-20': 'frozen',
        '2026-10-21': 'missed',
        '2026-10-22': 'done',
      }),
    );
    expect(supabase.rpc).toHaveBeenCalledWith('streak_states', {
      from_day: '2026-10-01',
      to_day: '2026-10-31',
      today: '2026-10-22',
    });
  });
});

describe('longestRun', () => {
  it('counts the days in a row that kept the streak, frozen ones too', () => {
    expect(longestRun(['done', 'frozen', 'done', 'missed', 'done', 'done'])).toBe(3);
    expect(longestRun(['missed', 'done', 'open'])).toBe(1);
    expect(longestRun([])).toBe(0);
  });
});
