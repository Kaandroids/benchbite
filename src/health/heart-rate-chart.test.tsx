import { fireEvent, render, screen } from '@/test/render';

import { HeartRateChart, heartRatePaths, heartRateScale } from './heart-rate-chart';

const STARTED = new Date('2026-11-06T18:04:00Z');
const FINISHED = new Date('2026-11-06T18:05:00Z');

async function renderChart(setTimes: Date[]) {
  await render(
    <HeartRateChart
      samples={[95, 120, null, 168, 140, 130, 110]}
      average={132}
      max={175}
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
      'Heart rate over the workout, from 95 to 175 beats a minute, 132 on average, with 2 sets',
    ),
  ).toBeOnTheScreen();
  expect(screen.getByText('avg 132')).toBeOnTheScreen();
  // The watch's own highest, as the card says, not the highest 10 seconds.
  expect(screen.getByText('175')).toBeOnTheScreen();
});

it('says nothing of the sets for a workout logged before their times were kept', async () => {
  await renderChart([]);

  expect(
    screen.getByLabelText(
      'Heart rate over the workout, from 95 to 175 beats a minute, 132 on average',
    ),
  ).toBeOnTheScreen();
});

describe('heartRatePaths', () => {
  const draw = (samples: (number | null)[]) =>
    heartRatePaths(samples, heartRateScale(samples, samples.length - 1));

  it('runs the line across gaps of up to 2 minutes, as a watch that measures now and then leaves', () => {
    // A value every 90 seconds, nine samples of 10 seconds apart.
    const samples = Array.from({ length: 28 }, (_, index) =>
      index % 9 === 0 ? 120 + index : null,
    );
    const { line, dots } = draw(samples);
    expect(line.startsWith('M')).toBe(true);
    expect(line.match(/L/g)).toHaveLength(3);
    expect(dots).toEqual([]);
  });

  it('breaks the line at longer gaps, and draws a value left alone as a dot', () => {
    const samples = [
      120,
      125,
      ...Array<null>(20).fill(null),
      140,
      ...Array<null>(20).fill(null),
      130,
    ];
    const { line, dots } = draw(samples);
    expect(line.match(/M/g)).toHaveLength(1);
    expect(dots).toHaveLength(2);
  });
});
