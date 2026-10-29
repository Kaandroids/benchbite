import { fireEvent, render, screen } from '@/test/render';
import type { DayTraining } from '@/workouts/day-training';

import { HeatMap } from './heat-map';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const TODAY = new Date(2026, 9, 29, 9, 0);

/** Each day from 29 July to today, untrained. */
const DAYS: DayTraining[] = Array.from({ length: 93 }, (_, index) => ({
  day: new Date(Date.UTC(2026, 6, 29 + index)).toISOString().slice(0, 10),
  minutes: 0,
  liftedKg: 0,
  done: 0,
  missed: 0,
}));

async function renderAt(width: number) {
  await render(<HeatMap days={DAYS} today={TODAY} accessibilityLabel="Heat map" />);
  await fireEvent(screen.getByLabelText('Heat map'), 'layout', {
    nativeEvent: { layout: { width } },
  });
}

it('names the months that started, and the weekdays beside cells large enough', async () => {
  await renderAt(330);
  // The first week has 1 August in it.
  expect(screen.getByText('Aug')).toBeTruthy();
  expect(screen.getByText('Sep')).toBeTruthy();
  expect(screen.getByText('Oct')).toBeTruthy();
  // November starts on Sunday, after today.
  expect(screen.queryByText('Nov')).toBeNull();
  expect(screen.getByText('Mon')).toBeTruthy();
});

it('leaves out the weekdays and the months too close together on a narrow map', async () => {
  await renderAt(60);
  expect(screen.queryByText('Mon')).toBeNull();
  expect(screen.getByText('Aug')).toBeTruthy();
  expect(screen.queryByText('Sep')).toBeNull();
  expect(screen.getByText('Oct')).toBeTruthy();
});
