import { Text } from 'react-native';

import { fireEvent, render, screen } from '@/test/render';

import { Screen } from './screen';

// The bar is not an accessibility element and has no label here, so it is found by its role prop.
const progressBars = () =>
  screen.container.queryAll((node) => node.props.accessibilityRole === 'progressbar');

describe('Screen', () => {
  it('shows its content and footer', async () => {
    await render(
      <Screen footer={<Text>Footer</Text>}>
        <Text>Content</Text>
      </Screen>,
    );
    expect(screen.getByText('Content')).toBeTruthy();
    expect(screen.getByText('Footer')).toBeTruthy();
  });

  it('has a back button that calls onBack', async () => {
    const onBack = jest.fn();
    await render(
      <Screen onBack={onBack}>
        <Text>Content</Text>
      </Screen>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows a progress bar only when given progress', async () => {
    await render(
      <Screen>
        <Text>Content</Text>
      </Screen>,
    );
    expect(progressBars()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    await screen.rerender(
      <Screen progress={{ sections: ['One', 'Two'], current: 1, value: 0 }}>
        <Text>Content</Text>
      </Screen>,
    );
    expect(progressBars()).toHaveLength(1);
    expect(progressBars()[0]).toHaveAccessibilityValue({ now: 50 });
  });
});
