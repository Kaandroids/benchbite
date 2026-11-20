import { router } from 'expo-router';

import { fireEvent, render, screen } from '@/test/render';

import { LicencesRow } from './licences-row';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

it('leads to the licences and credits', async () => {
  await render(<LicencesRow />);
  await fireEvent.press(screen.getByRole('button', { name: /^Licences and credits/ }));
  expect(router.push).toHaveBeenCalledWith('/licences');
});
