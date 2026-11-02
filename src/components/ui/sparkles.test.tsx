import { Text } from 'react-native';

import { render, screen } from '@/test/render';

import { Sparkles } from './sparkles';

describe('Sparkles', () => {
  it('shows what it surrounds, with four stars around it', async () => {
    await render(
      <Sparkles size={140}>
        <Text>Bite</Text>
      </Sparkles>,
    );
    expect(screen.getByText('Bite')).toBeTruthy();
    expect(screen.container.queryAll((node) => node.type === 'RNSVGPath')).toHaveLength(4);
  });
});
