import { render, screen } from '@/test/render';

import { AddEntryError } from './add-entry-error';

it.each([
  ['BB020', 'Meals can only be added to today and the week before.'],
  ['BB022', 'This food is no longer available.'],
  ['BB024', 'This meal has a new food, and you already have 200 of your own.'],
  ['BB026', 'This meal has a new food, but you have added 1,000 of your own'],
])('says why the database refused with %s', async (code, message) => {
  await render(<AddEntryError error={{ code }} />);

  expect(screen.getByText(new RegExp(`^${message}`))).toBeOnTheScreen();
});

it('offers trying again for any other failure', async () => {
  await render(<AddEntryError error={new Error('Network request failed')} />);

  expect(screen.getByText(/Check your connection and try again/)).toBeOnTheScreen();
});
