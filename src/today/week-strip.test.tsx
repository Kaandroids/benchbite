import { render, screen } from '@/test/render';

import { WeekStrip } from './week-strip';

// A Wednesday.
const WEDNESDAY = new Date(2026, 9, 21, 9, 0);

describe('WeekStrip', () => {
  it('shows the week from Monday to Sunday with today selected', async () => {
    await render(<WeekStrip today={WEDNESDAY} days={{}} />);
    expect(screen.getByLabelText('Mon 19')).toBeTruthy();
    expect(screen.getByLabelText('Wed 21').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByLabelText('Sun 25').props.accessibilityState).toEqual({ selected: false });
  });

  it('puts a flame behind kept days and a snowflake behind frozen ones', async () => {
    await render(
      <WeekStrip
        today={WEDNESDAY}
        days={{ '2026-10-19': 'done', '2026-10-20': 'frozen', '2026-10-12': 'done' }}
      />,
    );
    expect(screen.getByLabelText('Mon 19, streak kept')).toBeTruthy();
    expect(screen.getByLabelText('Tue 20, streak frozen')).toBeTruthy();
    expect(screen.getAllByTestId('streak-done')).toHaveLength(1);
    expect(screen.getAllByTestId('streak-frozen')).toHaveLength(1);
  });
});
