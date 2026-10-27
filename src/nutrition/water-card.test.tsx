import { fireEvent, render, screen } from '@/test/render';

import { useAddWater, useWater, useWaterGoal } from './water';
import { WaterCard } from './water-card';

jest.mock('./water', () => ({
  ...jest.requireActual('./water'),
  useWater: jest.fn(),
  useWaterGoal: jest.fn(),
  useAddWater: jest.fn(),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mutate = jest.fn();

function mockWater(ml: number, goal = 2000) {
  jest.mocked(useWater).mockReturnValue({ data: ml } as never);
  jest.mocked(useWaterGoal).mockReturnValue({ data: goal } as never);
  jest.mocked(useAddWater).mockReturnValue({ mutate } as never);
}

const glasses = () =>
  screen.container.queryAll((node) => node.props.accessibilityRole === 'progressbar')[0]!.props
    .accessibilityValue;

beforeEach(() => jest.clearAllMocks());

describe('WaterCard', () => {
  it('shows the water against the goal, in glasses', async () => {
    mockWater(1250);
    await render(<WaterCard day="2026-10-27" />);
    expect(screen.getByText('1.25 of 2 L · 3 glasses to go')).toBeTruthy();
    expect(glasses()).toEqual({ min: 0, max: 8, now: 5 });
  });

  it('adds and removes a glass', async () => {
    mockWater(500);
    await render(<WaterCard day="2026-10-27" />);
    await fireEvent.press(screen.getByLabelText('Add a glass, 250 ml'));
    expect(mutate).toHaveBeenCalledWith(250);
    await fireEvent.press(screen.getByLabelText('Remove a glass'));
    expect(mutate).toHaveBeenCalledWith(-250);
  });

  it('cannot take away a glass before the first', async () => {
    mockWater(0);
    await render(<WaterCard day="2026-10-27" />);
    expect(screen.getByLabelText('Remove a glass')).toBeDisabled();
  });

  it('says when the goal is reached, and keeps counting past it', async () => {
    mockWater(2500);
    await render(<WaterCard day="2026-10-27" />);
    expect(screen.getByText('2.5 of 2 L · goal reached')).toBeTruthy();
  });
});
