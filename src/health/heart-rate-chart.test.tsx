import { fireEvent, render, screen } from '@/test/render';

import { HeartRateChart } from './heart-rate-chart';

const STARTED = new Date('2026-11-06T18:04:00Z');
const FINISHED = new Date('2026-11-06T18:05:00Z');

async function renderChart(setTimes: Date[]) {
  await render(
    <HeartRateChart
      samples={[95, 120, null, 168, 140, 130, 110]}
      average={132}
      startedAt={STARTED}
      finishedAt={FINISHED}
      setTimes={setTimes}
    />,
  );
  // The chart is drawn once it knows its width.
  await fireEvent(screen.getByRole('image'), 'layout', { nativeEvent: { layout: { width: 300 } } });
}

it('reads out the range, the average and the sets', async () => {
  await renderChart([new Date('2026-11-06T18:04:20Z'), new Date('2026-11-06T18:04:50Z')]);

  expect(
    screen.getByLabelText(
      'Heart rate over the workout, from 95 to 168 beats a minute, 132 on average, with 2 sets',
    ),
  ).toBeOnTheScreen();
  expect(screen.getByText('avg 132')).toBeOnTheScreen();
  expect(screen.getByText('168')).toBeOnTheScreen();
});

it('marks no sets for a workout logged before their times were kept', async () => {
  await renderChart([]);

  expect(
    screen.getByLabelText(
      'Heart rate over the workout, from 95 to 168 beats a minute, 132 on average, with 0 sets',
    ),
  ).toBeOnTheScreen();
});
