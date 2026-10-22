import { act, renderHook } from '@/test/render';

import { NO_STREAK } from './streak';
import { sampleStreak, showSampleStreak, useStreak } from './use-streak';

// A Thursday.
const THURSDAY = new Date(2026, 9, 22, 9, 0);

describe('useStreak', () => {
  afterEach(() => showSampleStreak(null));

  it('is empty until streaks are recorded', async () => {
    const { result } = await renderHook(() => useStreak());
    expect(result.current).toEqual(NO_STREAK);
  });

  it('shows a sample streak and goes back to the user’s', async () => {
    const { result } = await renderHook(() => useStreak());
    const sample = sampleStreak(THURSDAY, true);
    await act(() => showSampleStreak(sample));
    expect(result.current).toBe(sample);
    await act(() => showSampleStreak(null));
    expect(result.current).toEqual(NO_STREAK);
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
