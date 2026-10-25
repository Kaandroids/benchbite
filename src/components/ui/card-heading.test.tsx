import { render, screen } from '@/test/render';

import { CardHeading } from './card-heading';
import { Text } from './text';

describe('CardHeading', () => {
  it('shows its title and what goes at its end', async () => {
    await render(
      <CardHeading icon="trophy" title="Records">
        <Text>+5 kg</Text>
      </CardHeading>,
    );
    expect(screen.getByText('Records')).toBeTruthy();
    expect(screen.getByText('+5 kg')).toBeTruthy();
  });
});
