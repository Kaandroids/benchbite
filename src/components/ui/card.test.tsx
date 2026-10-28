import { render, screen } from '@/test/render';

import { Card, CardDivider } from './card';
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

describe('Card as a list', () => {
  it('leaves the space above, below and between its rows to the rows', async () => {
    await render(
      <Card list>
        <Text>Bench press</Text>
      </Card>,
    );
    expect(screen.getByText('Bench press').parent!).toHaveStyle({ paddingVertical: 0, gap: 0 });
  });

  it('draws a divider across its padding, from border to border', async () => {
    await render(
      <Card>
        <Text>Today</Text>
        <CardDivider />
      </Card>,
    );
    const divider = screen.getByText('Today').parent!.children[1] as never;
    // The card's padding is the theme's large spacing, 16.
    expect(divider).toHaveStyle({ marginHorizontal: -16 });
  });
});
