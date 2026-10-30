import { StyleSheet } from 'react-native';

import { render, screen } from '@/test/render';

import { MacroBars, type MacroBar } from './macro-bars';

const bar = (key: string, calories: number): MacroBar => ({
  key,
  eaten: { calories, proteinG: 100, carbsG: 200, fatG: 60 },
  logged: true,
  over: false,
  accessibilityLabel: key,
});

describe('MacroBars', () => {
  it('labels the target line at its end, instead of in the legend', async () => {
    await render(<MacroBars bars={[bar('a', 2000), bar('b', 2400)]} target={3150} />);
    expect(screen.getByText('Target 3,150 kcal')).toBeTruthy();
    expect(screen.queryByText('Target')).toBeNull();
    expect(screen.getByText('Protein')).toBeTruthy();
  });

  it('leaves room above the target, so that it does not touch the top', async () => {
    await render(<MacroBars bars={[bar('a', 2000)]} target={3000} />);
    const line = screen.getByText('Target 3,000 kcal').parent!;
    // The target is the tallest, at five sixths of the chart's 120 points.
    expect(StyleSheet.flatten(line.props.style)).toMatchObject({ top: 19 });
  });

  it('leaves room above the tallest bar too', async () => {
    await render(<MacroBars bars={[bar('a', 3600)]} target={1800} />);
    const line = screen.getByText('Target 1,800 kcal').parent!;
    // Half the tallest bar's height, which is five sixths of the chart.
    expect(StyleSheet.flatten(line.props.style)).toMatchObject({ top: 69 });
  });
});
