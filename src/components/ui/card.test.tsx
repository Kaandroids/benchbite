import { render, screen } from '@/test/render';

import { Card } from './card';
import { Text } from './text';

describe('Card', () => {
  it('shows its content on a bordered surface', async () => {
    await render(
      <Card>
        <Text>Nutrition</Text>
      </Card>,
    );
    const card = screen.getByText('Nutrition').parent!;
    expect(card).toHaveStyle({ borderWidth: 1 });
  });
});

describe('Card with a style', () => {
  it('lets the style change its padding and layout', async () => {
    await render(
      <Card style={{ padding: 0, flexDirection: 'row' }}>
        <Text>Sets</Text>
      </Card>,
    );
    const card = screen.getByText('Sets').parent!;
    expect(card).toHaveStyle({ borderWidth: 1, padding: 0, flexDirection: 'row' });
  });
});
