import { addDays, toIsoDate } from '@/i18n/dates';
import { fireEvent, render, screen } from '@/test/render';

import { SAMPLE_PRICES } from './sample-prices';
import { TrialEndingScreen } from './trial-ending-screen';

const startedOn = new Date(2026, 9, 30);
const props = {
  startedOn,
  todayIndex: 4,
  usedOn: [0, 1, 3, 4].map((day) => toIsoDate(addDays(startedOn, day))),
  usage: { chats: 12, photos: 9, reviews: 1 },
  prices: SAMPLE_PRICES,
  onCancel: jest.fn(),
  onClose: jest.fn(),
};

describe('TrialEndingScreen', () => {
  it('shows the days left, the week and the yearly plan first', async () => {
    await render(<TrialEndingScreen {...props} onKeep={jest.fn()} />);
    expect(screen.getByText('FREE WEEK · DAY 5 OF 7')).toBeTruthy();
    expect(screen.getByText('Your trial summary')).toBeTruthy();
    expect(screen.getByText('2 more days together!')).toBeTruthy();
    expect(screen.getByLabelText('You used Bite on 4 days')).toBeTruthy();
    expect(screen.getByText('meal photos')).toBeTruthy();
    expect(screen.getByRole('radio', { checked: true })).toHaveTextContent(/€83\.88/);
  });

  it('names the user in the title, when they have a name', async () => {
    await render(<TrialEndingScreen {...props} name="Kaan" onKeep={jest.fn()} />);
    expect(screen.getByText("Kaan's")).toBeTruthy();
  });

  it('says so on the last day of the trial', async () => {
    await render(<TrialEndingScreen {...props} todayIndex={6} onKeep={jest.fn()} />);
    expect(screen.getByText('Last day together!')).toBeTruthy();
  });

  it('keeps the plan billed as chosen', async () => {
    const onKeep = jest.fn();
    await render(<TrialEndingScreen {...props} onKeep={onKeep} />);
    await fireEvent.press(screen.getByRole('radio', { name: /Monthly/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Keep premium, monthly' }));
    expect(onKeep).toHaveBeenCalledWith('monthly');
  });
});
