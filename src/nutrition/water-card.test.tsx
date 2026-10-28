import { fireEvent, render, screen } from '@/test/render';

import { useAddWater } from './water';
import { WaterCard } from './water-card';

jest.mock('./water', () => ({
  ...jest.requireActual('./water'),
  useAddWater: jest.fn(),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mutate = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useAddWater).mockReturnValue({ mutate } as never);
});

const glasses = () => ({
  full: screen.queryAllByTestId('glass-full').length,
  empty: screen.queryAllByTestId('glass-empty').length,
});

describe('WaterCard', () => {
  it('shows the water against the goal, a glass for each 250 ml of it', async () => {
    await render(<WaterCard day="2026-10-27" drunk={1250} goal={2000} />);
    expect(screen.getByText('1.25 of 2 L')).toBeTruthy();
    expect(screen.getByText('3 glasses to go')).toBeTruthy();
    expect(glasses()).toEqual({ full: 5, empty: 3 });
  });

  it('draws as many glasses as the goal has', async () => {
    await render(<WaterCard day="2026-10-27" drunk={0} goal={3000} />);
    expect(glasses()).toEqual({ full: 0, empty: 12 });
  });

  it('adds and removes a glass', async () => {
    await render(<WaterCard day="2026-10-27" drunk={500} goal={2000} />);
    await fireEvent.press(screen.getByLabelText('Add a glass, 250 ml'));
    expect(mutate).toHaveBeenCalledWith(250);
    await fireEvent.press(screen.getByLabelText('Remove a glass'));
    expect(mutate).toHaveBeenCalledWith(-250);
  });

  it('cannot take away a glass before the first', async () => {
    await render(<WaterCard day="2026-10-27" drunk={0} goal={2000} />);
    expect(screen.getByLabelText('Remove a glass')).toBeDisabled();
  });

  it('says when the goal is reached', async () => {
    await render(<WaterCard day="2026-10-27" drunk={2000} goal={2000} />);
    expect(screen.getByText('Goal reached')).toBeTruthy();
    expect(glasses()).toEqual({ full: 8, empty: 0 });
  });

  it('keeps the glasses full past the goal and says how much more was drunk', async () => {
    await render(<WaterCard day="2026-10-27" drunk={2500} goal={2000} />);
    expect(screen.getByText('2.5 of 2 L')).toBeTruthy();
    expect(screen.getByText('Goal reached · +500 ml')).toBeTruthy();
    expect(glasses()).toEqual({ full: 8, empty: 0 });
  });
});
