import { fireEvent, render, screen } from '@/test/render';

import { TextLink } from './text-link';

describe('TextLink', () => {
  it('is a button that calls onPress', async () => {
    const onPress = jest.fn();
    await render(<TextLink label="Read the privacy policy" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Read the privacy policy' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is centred by default and sits at the start when asked', async () => {
    await render(<TextLink label="Centred" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Centred' })).toHaveStyle({ alignSelf: 'center' });
    await render(<TextLink label="Start" align="start" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Start' })).toHaveStyle({
      alignSelf: 'flex-start',
    });
  });

  it('uses body size when asked', async () => {
    await render(<TextLink label="Log in" size="regular" onPress={jest.fn()} />);
    expect(screen.getByText('Log in')).toHaveStyle({ fontSize: 16 });
  });
});
