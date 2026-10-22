import { render, screen } from '@/test/render';

import { DailyProgress } from './daily-progress';

const TARGETS = { calories: 2850, proteinG: 180, carbsG: 355, fatG: 79 };

const progress = () =>
  screen.container
    .queryAll((node) => node.props.accessibilityRole === 'progressbar')
    .map((node) => [node.props.accessibilityLabel, node.props.accessibilityValue.now]);

describe('DailyProgress', () => {
  it('shows what was eaten against each target', async () => {
    await render(
      <DailyProgress
        targets={TARGETS}
        eaten={{ calories: 1240, proteinG: 92, carbsG: 130, fatG: 38 }}
      />,
    );
    expect(screen.getByText('1,240 / 2,850 kcal')).toBeTruthy();
    expect(screen.getByText('92 / 180 g')).toBeTruthy();
    expect(progress()).toEqual([
      ['Calories', 44],
      ['Protein', 51],
      ['Carbs', 37],
      ['Fat', 48],
    ]);
  });

  it('fills the bars no further than the target', async () => {
    await render(<DailyProgress targets={TARGETS} eaten={{ ...TARGETS, calories: 3500 }} />);
    expect(progress()[0]).toEqual(['Calories', 100]);
  });
});
