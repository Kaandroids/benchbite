import { render, screen } from '@/test/render';

import { WatchChip } from './watch-chip';

it('says the workout runs on the watch, with the heart rate once it has one', async () => {
  await render(<WatchChip heartRate={132} />);
  expect(screen.getByText('On your Apple Watch · 132 bpm')).toBeOnTheScreen();
  expect(
    screen.getByLabelText('Following on your Apple Watch, heart rate 132 beats per minute'),
  ).toBeOnTheScreen();

  await render(<WatchChip heartRate={null} />);
  expect(screen.getByText('On your Apple Watch')).toBeOnTheScreen();
  expect(screen.getByLabelText('Following on your Apple Watch')).toBeOnTheScreen();
});
