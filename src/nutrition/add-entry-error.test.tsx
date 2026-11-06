import { render, screen } from '@/test/render';

import { AddEntryError } from './add-entry-error';

it.each([
  ['BB020', 'Meals can only be added to today and the week before.'],
  ['BB022', 'This food is no longer available.'],
  [
    'BB024',
    'The new foods in this meal would take you past 200 of your own. To make room, delete some under Mine. This estimate will be lost.',
  ],
  ['BB026', 'The new foods in this meal would take you past 1,000 added in all'],
])('says why the database refused with %s', async (code, message) => {
  await render(<AddEntryError error={{ code }} />);

  expect(screen.getByText(new RegExp(`^${message}`))).toBeOnTheScreen();
});

it('offers trying again for any other failure', async () => {
  await render(<AddEntryError error={new Error('Network request failed')} />);

  expect(screen.getByText(/Check your connection and try again/)).toBeOnTheScreen();
});
