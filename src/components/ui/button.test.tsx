import { fireEvent, render, screen } from '@/test/render';

import { Button } from './button';

describe('Button', () => {
  it('calls onPress when pressed', async () => {
    const onPress = jest.fn();
    await render(<Button label="Continue" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores presses while disabled or loading', async () => {
    const onPress = jest.fn();
    await render(<Button label="Continue" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByRole('button'));
    await screen.rerender(<Button label="Continue" onPress={onPress} loading />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeBusy();
  });

  it('is announced as disabled', async () => {
    await render(<Button label="Continue" disabled />);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('shows a spinner instead of the label while loading, keeping its name', async () => {
    await render(<Button label="Continue" loading />);
    expect(screen.queryByText('Continue')).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeBusy();
  });
});
