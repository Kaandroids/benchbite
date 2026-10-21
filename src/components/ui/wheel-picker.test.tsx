import { fireEvent, render, screen } from '@/test/render';

import { WheelPicker } from './wheel-picker';

const VALUES = [1, 2, 3];

function action(actionName: 'increment' | 'decrement') {
  return fireEvent(screen.getByRole('adjustable', { name: 'Amount' }), 'accessibilityAction', {
    nativeEvent: { actionName },
  });
}

describe('WheelPicker', () => {
  it('steps to the next and previous value with screen reader actions', async () => {
    const onChange = jest.fn();
    await render(
      <WheelPicker accessibilityLabel="Amount" values={VALUES} value={2} onChange={onChange} />,
    );
    await action('increment');
    expect(onChange).toHaveBeenLastCalledWith(3);
    await action('decrement');
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('does not step past the first or last value', async () => {
    const onChange = jest.fn();
    await render(
      <WheelPicker accessibilityLabel="Amount" values={VALUES} value={3} onChange={onChange} />,
    );
    await action('increment');
    await screen.rerender(
      <WheelPicker accessibilityLabel="Amount" values={VALUES} value={1} onChange={onChange} />,
    );
    await action('decrement');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows and announces the values with the format', async () => {
    await render(
      <WheelPicker
        accessibilityLabel="Amount"
        values={VALUES}
        value={2}
        onChange={jest.fn()}
        format={(value) => `${value} ft`}
      />,
    );
    expect(screen.getByText('2 ft')).toBeTruthy();
    expect(screen.getByRole('adjustable', { name: 'Amount' })).toHaveAccessibilityValue({
      text: '2 ft',
    });
  });

  it('announces the value with its own format when given one', async () => {
    await render(
      <WheelPicker
        accessibilityLabel="Amount"
        values={VALUES}
        value={2}
        onChange={jest.fn()}
        formatAccessibilityValue={(value) => `${value} kilograms`}
      />,
    );
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByRole('adjustable', { name: 'Amount' })).toHaveAccessibilityValue({
      text: '2 kilograms',
    });
  });
});
