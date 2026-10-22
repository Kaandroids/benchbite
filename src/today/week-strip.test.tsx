import { render, screen } from '@/test/render';

import { WeekStrip } from './week-strip';

// A Wednesday.
const WEDNESDAY = new Date(2026, 9, 21, 9, 0);
const NONE = new Set<string>();

describe('WeekStrip', () => {
  it('shows the week from Monday to Sunday with today selected', async () => {
    await render(<WeekStrip today={WEDNESDAY} days={{}} trainingDays={[]} trainedOn={NONE} />);
    expect(screen.getByLabelText('Mon 19')).toBeTruthy();
    expect(screen.getByLabelText('Wed 21').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByLabelText('Sun 25').props.accessibilityState).toEqual({ selected: false });
  });

  it('marks kept days with a flame and frozen ones with a snowflake', async () => {
    await render(
      <WeekStrip
        today={WEDNESDAY}
        days={{ '2026-10-19': 'done', '2026-10-20': 'frozen', '2026-10-12': 'done' }}
        trainingDays={[]}
        trainedOn={NONE}
      />,
    );
    expect(screen.getByLabelText('Mon 19, streak kept')).toBeTruthy();
    expect(screen.getByLabelText('Tue 20, streak frozen')).toBeTruthy();
    expect(screen.getAllByTestId('streak-done')).toHaveLength(1);
    expect(screen.getAllByTestId('streak-frozen')).toHaveLength(1);
  });

  it('marks workouts as done, missed or planned', async () => {
    await render(
      <WeekStrip
        today={WEDNESDAY}
        days={{}}
        trainingDays={[1, 2, 3, 5]}
        trainedOn={new Set(['2026-10-19'])}
      />,
    );
    expect(screen.getByLabelText('Mon 19, workout done')).toBeTruthy();
    expect(screen.getByLabelText('Tue 20, workout missed')).toBeTruthy();
    // Today's workout is still ahead until it is finished.
    expect(screen.getByLabelText('Wed 21, workout planned')).toBeTruthy();
    expect(screen.getByLabelText('Fri 23, workout planned')).toBeTruthy();
    expect(screen.getByLabelText('Sat 24')).toBeTruthy();
  });
});
