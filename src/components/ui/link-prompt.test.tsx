import { fireEvent, render, screen } from '@/test/render';

import { LinkPrompt } from './link-prompt';

describe('LinkPrompt', () => {
  it('shows the question and answers it with the link', async () => {
    const onPress = jest.fn();
    await render(
      <LinkPrompt question="Already have an account?" action="Log in" onPress={onPress} />,
    );
    expect(screen.getByText('Already have an account?', { exact: false })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));
    expect(onPress).toHaveBeenCalled();
  });
});
