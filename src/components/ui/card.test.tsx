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
