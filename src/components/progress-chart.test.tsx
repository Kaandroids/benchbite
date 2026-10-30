import { fireEvent, render, screen } from '@/test/render';

import { niceStep, ProgressChart, ticksOf } from './progress-chart';

describe('niceStep', () => {
  it('rounds a step up to 1, 2, 2.5 or 5 times a power of ten', () => {
    expect(niceStep(0.7, 'decimal')).toBe(1);
    expect(niceStep(7.5, 'decimal')).toBe(10);
    expect(niceStep(18, 'decimal')).toBe(20);
    expect(niceStep(240, 'decimal')).toBe(250);
    expect(niceStep(5, 'decimal')).toBe(5);
    expect(niceStep(2.2, 'decimal')).toBe(2.5);
  });

  it('keeps whole numbers whole', () => {
    expect(niceStep(2.2, 'whole')).toBe(5);
    expect(niceStep(0.3, 'whole')).toBe(1);
    expect(niceStep(24, 'whole')).toBe(25);
  });

  it('steps times by round seconds and minutes', () => {
    expect(niceStep(2.5, 'time')).toBe(5);
    expect(niceStep(12, 'time')).toBe(15);
    expect(niceStep(100, 'time')).toBe(120);
    expect(niceStep(5000, 'time')).toBe(6000);
  });
});

describe('ticksOf', () => {
  it('puts round values around the lowest and the highest', () => {
    expect(ticksOf([70, 72.5, 75, 80, 85], 'decimal')).toEqual([70, 80, 90]);
    expect(ticksOf([5, 10], 'whole')).toEqual([5, 10]);
    expect(ticksOf([40, 45, 75, 50], 'time')).toEqual([30, 60, 90]);
  });

  it('puts a single value between two lines', () => {
    expect(ticksOf([80], 'decimal')).toEqual([70, 80, 90]);
    expect(ticksOf([2], 'whole')).toEqual([1, 2, 3]);
  });

  it('does not go below zero for values that are not negative', () => {
    expect(ticksOf([0.5], 'decimal')).toEqual([0, 1, 2]);
    expect(ticksOf([0], 'whole')).toEqual([0, 1]);
    expect(ticksOf([-5, 5], 'decimal')).toEqual([-5, 0, 5]);
  });
});

describe('ProgressChart', () => {
  it('scales to a far target and draws it with its label, instead of pinning it to the edge', async () => {
    await render(
      <ProgressChart
        points={[84, 85, 86].map((value, day) => ({ date: new Date(2026, 9, day + 1), value }))}
        formatValue={(value) => `${value} kg`}
        formatTick={String}
        scale="whole"
        description="Weight"
        target={{ value: 60, label: 'Target 60 kg' }}
      />,
    );
    await fireEvent(screen.getByLabelText('Weight'), 'layout', {
      nativeEvent: { layout: { width: 320, height: 150 } },
    });
    // The chart's texts are drawn by the SVG, as the content of its spans.
    const texts = screen.container
      .queryAll((node) => node.type === 'RNSVGTSpan')
      .map((node) => node.props.content as string);
    // The axis reaches down to the target, which no longer gets an arrow.
    expect(texts).toContain('Target 60 kg');
    expect(texts).toContain('60');
    expect(texts.some((text) => text.includes('↓'))).toBe(false);
  });
});
