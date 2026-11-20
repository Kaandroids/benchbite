import { router } from 'expo-router';

import { fireEvent, render, screen } from '@/test/render';

import { LicencesRow } from './licences-row';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

it('leads to the licences and credits, and says what they are', async () => {
  await render(<LicencesRow />);
  const row = screen.getByRole('button', { name: /^Licences and credits/ });
  expect(row).toHaveProp('accessibilityHint', 'Opens the licences and credits');
  expect(
    screen.getByText('The open source libraries and the data Benchbite is built with.'),
  ).toBeOnTheScreen();

  await fireEvent.press(row);
  expect(router.push).toHaveBeenCalledWith('/licences');
});
