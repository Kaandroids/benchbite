import { router } from 'expo-router';

import { fireEvent, render, screen } from '@/test/render';

import { BiteButton } from './bite-button';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

it('opens Bite over the tabs', async () => {
  await render(<BiteButton />);
  await fireEvent.press(screen.getByRole('button', { name: 'Talk to Bite' }));
  expect(router.push).toHaveBeenCalledWith('/bite');
});
