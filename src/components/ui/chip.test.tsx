import { fireEvent, render, screen } from '@/test/render';

import { Chip } from './chip';

describe('Chip', () => {
  it('is announced as selected and calls onPress when pressed', async () => {
    const onPress = jest.fn();
    await render(<Chip label="Chest" selected onPress={onPress} />);
    expect(screen.getByRole('button', { name: 'Chest' })).toBeSelected();
    await fireEvent.press(screen.getByRole('button', { name: 'Chest' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores presses while disabled', async () => {
    const onPress = jest.fn();
    await render(<Chip label="Barbell" selected={false} onPress={onPress} disabled />);
    expect(screen.getByRole('button', { name: 'Barbell' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Barbell' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});
