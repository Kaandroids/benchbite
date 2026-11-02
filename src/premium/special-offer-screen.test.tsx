import { act, render, screen } from '@/test/render';

import { SpecialOfferScreen } from './special-offer-screen';

jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));

describe('SpecialOfferScreen', () => {
  beforeEach(() => jest.useFakeTimers({ now: new Date(2026, 10, 3, 12, 0, 0) }));
  afterEach(() => jest.useRealTimers());

  it('shows the offer and counts down to its end', async () => {
    await render(
      <SpecialOfferScreen
        percent={40}
        usualPrice="€83.88"
        price="€50.33"
        endsAt={new Date(2026, 10, 3, 13, 0, 5)}
        waiting={{ workouts: 7, alternatives: 4, chats: 23 }}
        onClaim={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByText('€50.33')).toBeTruthy();
    expect(screen.getByLabelText('Usually €83.88')).toBeTruthy();
    expect(screen.getByText('Ends in 01:00:05')).toBeTruthy();
    await act(() => jest.advanceTimersByTime(6000));
    expect(screen.getByText('Ends in 00:59:59')).toBeTruthy();
  });
});
