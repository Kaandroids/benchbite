import { router } from 'expo-router';

import type { NutritionTargets } from '@/nutrition/targets';
import { fireEvent, render, screen } from '@/test/render';

import { TargetsCard } from './targets-card';

jest.mock('expo-router', () => ({ router: { navigate: jest.fn() } }));

const TARGETS: NutritionTargets = { calories: 2200, proteinG: 150, carbsG: 250, fatG: 70 };
const eaten = (calories: number) => ({ calories, proteinG: 84, carbsG: 140, fatG: 36 });

describe('TargetsCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the calories left and the macros against their targets', async () => {
    await render(<TargetsCard targets={TARGETS} eaten={eaten(1280)} day="2026-10-21" />);
    expect(screen.getByText('Your daily target')).toBeTruthy();
    expect(screen.getByText('920')).toBeTruthy();
    expect(screen.getByText('kcal left')).toBeTruthy();
    expect(screen.getByText('84 / 150 g')).toBeTruthy();
    expect(screen.getByText('140 / 250 g')).toBeTruthy();
    expect(screen.getByText('36 / 70 g')).toBeTruthy();
  });

  it('shows the calories over the target', async () => {
    await render(<TargetsCard targets={TARGETS} eaten={eaten(2500)} day="2026-10-21" />);
    expect(screen.getByText('300')).toBeTruthy();
    expect(screen.getByText('kcal over')).toBeTruthy();
  });

  it('leaves the ring and the bars to the label of the card', async () => {
    await render(<TargetsCard targets={TARGETS} eaten={eaten(1280)} day="2026-10-21" />);
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
  });

  it('opens Nutrition on its day', async () => {
    await render(<TargetsCard targets={TARGETS} eaten={eaten(1280)} day="2026-10-21" />);
    const card = screen.getByRole('button', {
      name: 'Your daily target: 1,280 of 2,200 kcal eaten, Protein 84 of 150 g, Carbs 140 of 250 g, Fat 36 of 70 g',
    });
    expect(card.props.accessibilityHint).toBe('Opens Nutrition');
    await fireEvent.press(card);
    expect(router.navigate).toHaveBeenCalledWith({
      pathname: '/nutrition',
      params: { day: '2026-10-21', at: expect.any(String) },
    });
  });
});
