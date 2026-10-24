import { fireEvent, render, screen } from '@/test/render';

import { PillButton } from './pill-button';

describe('PillButton', () => {
  it('calls onPress when pressed', async () => {
    const onPress = jest.fn();
    await render(<PillButton label="Edit" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is announced as disabled and ignores presses while disabled', async () => {
    const onPress = jest.fn();
    await render(<PillButton variant="primary" label="Save" onPress={onPress} disabled />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});
