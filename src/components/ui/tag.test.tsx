import { render, screen } from '@/test/render';
import { lightColors } from '@/theme/colors';

import { Tag } from './tag';

describe('Tag', () => {
  it('shows its label, with an icon when given one', async () => {
    await render(<Tag icon="arrow" label="Moved from Monday" />);
    expect(screen.getByText('Moved from Monday')).toBeTruthy();
  });

  it('shows something to check in amber', async () => {
    await render(<Tag label="Estimated" tone="warning" />);
    expect(screen.getByText('Estimated')).toHaveStyle({ color: lightColors.warning });
  });
});
