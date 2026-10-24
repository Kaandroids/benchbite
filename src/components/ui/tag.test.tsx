import { render, screen } from '@/test/render';

import { Tag } from './tag';

describe('Tag', () => {
  it('shows its label, with an icon when given one', async () => {
    await render(<Tag icon="arrow" label="Moved from Monday" />);
    expect(screen.getByText('Moved from Monday')).toBeTruthy();
  });
});
