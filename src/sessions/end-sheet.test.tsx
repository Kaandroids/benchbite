import { fireEvent, render, screen } from '@/test/render';

import { EndSheet } from './end-sheet';

const at = (hours: number, minutes: number, seconds = 0) =>
  new Date(2026, 9, 24, hours, minutes, seconds).getTime();

describe('EndSheet', () => {
  it('offers the minute of a last set and a now within the same minute', async () => {
    const onDone = jest.fn();
    await render(
      <EndSheet
        value={at(1, 20, 35)}
        earliest={at(1, 20, 10)}
        latest={at(1, 20, 35)}
        lastSet="1:20 AM"
        onDone={onDone}
        onClose={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledWith(at(1, 20));
  });
});
