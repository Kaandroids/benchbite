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

  it('rounds what was eaten to whole numbers', async () => {
    await render(
      <DailyProgress
        targets={TARGETS}
        eaten={{ calories: 1280.4, proteinG: 9.9, carbsG: 26.7, fatG: 3.3 }}
      />,
    );
    expect(screen.getByText('1,280 / 2,850 kcal')).toBeTruthy();
    expect(screen.getByText('10 / 180 g')).toBeTruthy();
    expect(screen.getByText('27 / 355 g')).toBeTruthy();
    expect(screen.getByText('3 / 79 g')).toBeTruthy();
  });

  it('fills the bars no further than the target', async () => {
    await render(<DailyProgress targets={TARGETS} eaten={{ ...TARGETS, calories: 3500 }} />);
    expect(progress()[0]).toEqual(['Calories', 100]);
  });
});
