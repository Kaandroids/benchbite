import { fireEvent, render, screen } from '@/test/render';

import { SAMPLE_PRICES } from './sample-prices';
import { TrialEndingScreen } from './trial-ending-screen';

const props = {
  endsOn: new Date(2026, 10, 5),
  daysLeft: 2,
  usage: { chats: 12, photos: 9, reviews: 1 },
  prices: SAMPLE_PRICES,
  onCancel: jest.fn(),
  onClose: jest.fn(),
};

describe('TrialEndingScreen', () => {
  it('shows what the trial gave and the yearly price first', async () => {
    await render(<TrialEndingScreen {...props} onKeep={jest.fn()} />);
    expect(screen.getByText('Your free week ends in 2 days')).toBeTruthy();
    expect(screen.getByText('meal photos')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('€83.88')).toBeTruthy();
    expect(screen.getByText('That is €6.99 a month')).toBeTruthy();
  });

  it('keeps the plan billed as chosen', async () => {
    const onKeep = jest.fn();
    await render(<TrialEndingScreen {...props} onKeep={onKeep} />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Monthly' }));
    expect(screen.getByText('€8.99')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Keep premium, monthly' }));
    expect(onKeep).toHaveBeenCalledWith('monthly');
  });
});
