import { fireEvent, render, screen } from '@/test/render';

import { Slider } from './slider';

function action(actionName: 'increment' | 'decrement') {
  return fireEvent(screen.getByRole('adjustable', { name: 'Pace' }), 'accessibilityAction', {
    nativeEvent: { actionName },
  });
}

function renderSlider(value: number, onChange = jest.fn()) {
  return render(
    <Slider
      accessibilityLabel="Pace"
      value={value}
      onChange={onChange}
      min={0.1}
      max={0.5}
      step={0.1}
      formatAccessibilityValue={(pace) => `${pace} kg per week`}
      minLabel="Slower"
      maxLabel="Faster"
    />,
  );
}

describe('Slider', () => {
  it('steps up and down with screen reader actions', async () => {
    const onChange = jest.fn();
    await renderSlider(0.2, onChange);
    await action('increment');
    // Rounded, rather than 0.30000000000000004.
    expect(onChange).toHaveBeenLastCalledWith(0.3);
    await action('decrement');
    expect(onChange).toHaveBeenLastCalledWith(0.1);
  });

  it('does not step above max', async () => {
    const onChange = jest.fn();
    await renderSlider(0.5, onChange);
    await action('increment');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not step below min', async () => {
    const onChange = jest.fn();
    await renderSlider(0.1, onChange);
    await action('decrement');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('announces the value and the range', async () => {
    await renderSlider(0.3);
    expect(screen.getByRole('adjustable', { name: 'Pace' })).toHaveAccessibilityValue({
      min: 0.1,
      max: 0.5,
      now: 0.3,
      text: '0.3 kg per week',
    });
  });

  it('labels both ends', async () => {
    await renderSlider(0.3);
    expect(screen.getByText('Slower')).toBeTruthy();
    expect(screen.getByText('Faster')).toBeTruthy();
  });
});
