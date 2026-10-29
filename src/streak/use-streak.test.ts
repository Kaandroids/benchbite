import { supabase } from '@/lib/supabase';
import { act, renderHook, waitFor } from '@/test/render';

import { NO_STREAK } from './streak';
import { sampleStreak } from './sample-streak';
import { showSampleStreak, useStreak } from './use-streak';

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
    const { result } = await renderHook(() => useStreak(THURSDAY));
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

  it('shows a sample streak and goes back to the user’s', async () => {
    mockStreak();
    const { result } = await renderHook(() => useStreak(THURSDAY));
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
