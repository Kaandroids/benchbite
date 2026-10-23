import { render, screen } from '@/test/render';
import { NO_STREAK } from '@/streak/streak';

import { WeekCard } from './week-card';

// A Wednesday.
const WEDNESDAY = new Date(2026, 9, 21, 9, 0);

describe('WeekCard', () => {
  it("shows today's date and the week from Monday to Sunday with today selected", async () => {
    await render(<WeekCard today={WEDNESDAY} streak={NO_STREAK} trainingDays={[]} finished={[]} />);
    expect(screen.getByText('Wednesday, October 21')).toBeTruthy();
    expect(screen.getByLabelText('Mon 19')).toBeTruthy();
    expect(screen.getByLabelText('Wed 21').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByLabelText('Sun 25').props.accessibilityState).toEqual({ selected: false });
  });

  it('marks workouts as done, missed or planned, and counts the ones done', async () => {
    await render(
      <WeekCard
        today={WEDNESDAY}
        streak={NO_STREAK}
        trainingDays={[1, 2, 3, 5]}
        finished={['2026-10-19', '2026-10-19']}
      />,
    );
    expect(screen.getByText('1 of 4 workouts this week')).toBeTruthy();
    expect(screen.getByLabelText('Mon 19, workout done')).toBeTruthy();
    expect(screen.getByLabelText('Tue 20, workout missed')).toBeTruthy();
    // Today's workout is still ahead until it is finished.
    expect(screen.getByLabelText('Wed 21, workout planned')).toBeTruthy();
    expect(screen.getByLabelText('Fri 23, workout planned')).toBeTruthy();
    expect(screen.getByLabelText('Sat 24')).toBeTruthy();
  });

  it('ticks a rest day on which a workout was finished anyway', async () => {
    await render(
      <WeekCard
        today={WEDNESDAY}
        streak={NO_STREAK}
        trainingDays={[1]}
        finished={['2026-10-20']}
      />,
    );
    expect(screen.getByLabelText('Tue 20, workout done')).toBeTruthy();
    expect(screen.getByText('1 of 1 workout this week')).toBeTruthy();
  });
});
