import { fireEvent, render, screen } from '@/test/render';

import { TextLink } from './text-link';

describe('TextLink', () => {
  it('is a button that calls onPress', async () => {
    const onPress = jest.fn();
    await render(<TextLink label="Read the privacy policy" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Read the privacy policy' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
