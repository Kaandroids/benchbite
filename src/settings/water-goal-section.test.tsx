import { fireEvent, render, screen } from '@/test/render';
import { useSetWaterGoal, useWaterGoal } from '@/profile/water-goal';

import { WaterGoalSection } from './water-goal-section';

jest.mock('@/profile/water-goal', () => ({
  ...jest.requireActual('@/profile/water-goal'),
  useWaterGoal: jest.fn(),
  useSetWaterGoal: jest.fn(),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('WaterGoalSection', () => {
  it('changes the daily water goal', async () => {
    const mutate = jest.fn();
    jest.mocked(useWaterGoal).mockReturnValue({ data: 2000 } as never);
    jest.mocked(useSetWaterGoal).mockReturnValue({ mutate } as never);
    await render(<WaterGoalSection />);
    expect(screen.getByRole('radio', { name: '2 L' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: '2.5 L' }));
    expect(mutate).toHaveBeenCalledWith(2500);
  });
});
