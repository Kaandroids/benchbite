import { fireEvent, render, screen, waitFor } from '@/test/render';

import { SessionError } from './session-error';

describe('SessionError', () => {
  it('explains the problem', async () => {
    await render(<SessionError onRetry={jest.fn()} />);
    expect(screen.getByText('Couldn’t connect')).toBeTruthy();
  });

  it('retries and shows that it is busy until the retry finishes', async () => {
    let finish: () => void = () => {};
    const onRetry = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    await render(<SessionError onRetry={onRetry} />);
    // The press resolves once the retry does.
    const pressing = fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('button', { name: 'Try again', busy: true });
    expect(onRetry).toHaveBeenCalledTimes(1);
    finish();
    await pressing;
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).not.toBeBusy());
  });
});
