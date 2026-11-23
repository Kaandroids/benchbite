import { Text } from 'react-native';

import { render, screen } from '@/test/render';

import { MuscleTile } from './muscle-tile';

describe('MuscleTile', () => {
  it('shows the body from the front and the back, inside its frame', async () => {
    await render(
      <MuscleTile primary={['quadriceps']} secondary={['glutes']} size={46} fallback={null} />,
    );
    // 46 less the border and the padding on both sides, halved for each side.
    expect(
      screen.getByTestId('muscle-map-front-whole', { includeHiddenElements: true }),
    ).toHaveStyle({ width: 19, height: 38 });
    expect(
      screen.getByTestId('muscle-map-back-whole', { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  it('shows its fallback without a muscle', async () => {
    await render(<MuscleTile primary={[]} secondary={[]} size={46} fallback={<Text>icon</Text>} />);
    expect(screen.getByText('icon')).toBeTruthy();
    expect(screen.queryByTestId('muscle-tile', { includeHiddenElements: true })).toBeNull();
  });
});
