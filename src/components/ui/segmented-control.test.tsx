import { fireEvent, render, screen } from '@/test/render';

import { SegmentedControl } from './segmented-control';

const OPTIONS = [
  { value: 'kg', label: 'kg' },
  { value: 'lb', label: 'lb' },
] as const;

describe('SegmentedControl', () => {
  it('shows the selected option', async () => {
    await render(
      <SegmentedControl
        accessibilityLabel="Unit"
        options={OPTIONS}
        value="lb"
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByRole('radio', { name: 'lb' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'kg' })).not.toBeChecked();
  });

  it('reports another option when it is pressed', async () => {
    const onChange = jest.fn();
    await render(
      <SegmentedControl
        accessibilityLabel="Unit"
        options={OPTIONS}
        value="kg"
        onChange={onChange}
      />,
    );
    await fireEvent.press(screen.getByRole('radio', { name: 'lb' }));
    expect(onChange).toHaveBeenCalledWith('lb');
  });

  it('ignores a press on the selected option', async () => {
    const onChange = jest.fn();
    await render(
      <SegmentedControl
        accessibilityLabel="Unit"
        options={OPTIONS}
        value="kg"
        onChange={onChange}
      />,
    );
    await fireEvent.press(screen.getByRole('radio', { name: 'kg' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
