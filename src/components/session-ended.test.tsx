import { fireEvent, render, screen } from '@/test/render';

import { SessionEnded } from './session-ended';

describe('SessionEnded', () => {
  it('explains that the data is out of reach, and starts again', async () => {
    const startAgain = jest.fn(() => Promise.resolve());
    await render(<SessionEnded onStartAgain={startAgain} />);
    expect(screen.getByText('Your guest session ended')).toBeTruthy();
    expect(screen.getByText(/can’t be opened here anymore/)).toBeTruthy();
    // Accounts have no screens yet (#130), so these do nothing for now.
    await fireEvent.press(screen.getByRole('button', { name: 'Create an account' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));
    expect(startAgain).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Start again' }));
    expect(startAgain).toHaveBeenCalledTimes(1);
  });
});
