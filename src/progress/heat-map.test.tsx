import type { DayTraining } from '@/history/day-training';
import { fireEvent, render, screen } from '@/test/render';

import { HeatMap, heatColor } from './heat-map';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const TODAY = new Date(2026, 9, 29, 9, 0);

/** Each day from `from` to today, untrained. */
const daysFrom = (from: Date, today = TODAY): DayTraining[] =>
  Array.from(
    { length: Math.round((today.getTime() - from.getTime()) / 86_400_000) + 1 },
    (_, index) => ({
      day: new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate() + index))
        .toISOString()
        .slice(0, 10),
      minutes: 0,
      liftedKg: 0,
      done: 0,
      missed: 0,
    }),
  );

async function renderMap(days: DayTraining[], today = TODAY) {
  await render(<HeatMap days={days} today={today} accessibilityLabel="Heat map" />);
  await fireEvent(screen.getByLabelText('Heat map'), 'layout', {
    nativeEvent: { layout: { width: 330 } },
  });
}

describe('HeatMap', () => {
  it('names the weekdays, and the months that started by today', async () => {
    await renderMap(daysFrom(new Date(2026, 6, 29)));
    expect(screen.getByText('Mon')).toBeTruthy();
    // The first week has 1 August in it.
    expect(screen.getByText('Aug')).toBeTruthy();
    expect(screen.getByText('Sep')).toBeTruthy();
    expect(screen.getByText('Oct')).toBeTruthy();
    // November starts on Sunday, after today.
    expect(screen.queryByText('Nov')).toBeNull();
  });

  it('draws every week of a year, scrolling back from today', async () => {
    await renderMap(daysFrom(new Date(2025, 9, 29)));
    // From the week of 27 October 2025 to that of 26 October 2026.
    expect(screen.getByText('Nov')).toBeTruthy();
    expect(screen.getByText('Mar')).toBeTruthy();
    expect(screen.getByText('Oct')).toBeTruthy();
  });

  it('keeps the week of today across a clock change', async () => {
    const zone = process.env.TZ;
    // Clocks in Berlin go forward on 29 March 2026, which makes that week an hour short.
    process.env.TZ = 'Europe/Berlin';
    try {
      const today = new Date(2026, 4, 15);
      await renderMap(daysFrom(new Date(2026, 1, 15), today), today);
      // Every day from 15 February to 17 May, the Sunday of the week of today.
      expect(JSON.stringify(screen.toJSON()).match(/"RNSVGRect"/g)).toHaveLength(92);
    } finally {
      process.env.TZ = zone;
    }
  });
});

describe('heatColor', () => {
  it('shades a day darker the longer it was trained', () => {
    expect([0, 1, 29, 30, 59, 60, 89, 90, 240].map(heatColor)).toEqual([
      'track',
      'heat1',
      'heat1',
      'heat2',
      'heat2',
      'heat3',
      'heat3',
      'heat4',
      'heat4',
    ]);
  });
});
