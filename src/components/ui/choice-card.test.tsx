import { fireEvent, render, screen } from '@/test/render';

import { ChoiceCard } from './choice-card';

describe('ChoiceCard', () => {
  it('calls onPress when pressed', async () => {
    const onPress = jest.fn();
    await render(<ChoiceCard title="Gym" selected={false} onPress={onPress} />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Gym' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is announced with its title and description', async () => {
    await render(
      <ChoiceCard title="Gym" description="Machines and barbells" selected onPress={jest.fn()} />,
    );
    expect(screen.getByRole('radio', { name: 'Gym, Machines and barbells' })).toBeTruthy();
    expect(screen.getByText('Machines and barbells')).toBeTruthy();
  });

  it('shows whether it is selected', async () => {
    await render(<ChoiceCard title="Gym" selected={false} onPress={jest.fn()} />);
    expect(screen.getByRole('radio', { name: 'Gym' })).not.toBeChecked();
    await screen.rerender(<ChoiceCard title="Gym" selected onPress={jest.fn()} />);
    expect(screen.getByRole('radio', { name: 'Gym' })).toBeChecked();
  });

  it('can be a checkbox for answers with several choices', async () => {
    await render(<ChoiceCard type="checkbox" title="Monday" selected onPress={jest.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'Monday' })).toBeChecked();
  });
});
