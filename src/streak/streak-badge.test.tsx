import { render, screen } from '@/test/render';

import { StreakBadge } from './streak-badge';

describe('StreakBadge', () => {
  it('shows the number of days', async () => {
    await render(<StreakBadge streak={{ count: 12, doneToday: true, days: {} }} />);
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByLabelText('12-day streak')).toBeTruthy();
  });

  it('counts a single day in the singular', async () => {
    await render(<StreakBadge streak={{ count: 1, doneToday: false, days: {} }} />);
    expect(screen.getByLabelText('1-day streak')).toBeTruthy();
  });
});
