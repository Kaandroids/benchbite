import { Text } from 'react-native';

import { render, screen } from '@/test/render';

import { ThemeScheme, useTheme } from './index';

function Scheme() {
  return <Text>{useTheme().scheme}</Text>;
}

describe('ThemeScheme', () => {
  it('follows the system outside of it', async () => {
    await render(<Scheme />);
    expect(screen.getByText('light')).toBeTruthy();
  });

  it('keeps its scheme inside, whatever the system has', async () => {
    await render(
      <ThemeScheme scheme="dark">
        <Scheme />
      </ThemeScheme>,
    );
    expect(screen.getByText('dark')).toBeTruthy();
  });
});
