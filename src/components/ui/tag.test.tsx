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

  it('is read as one, with the label given for a screen reader', async () => {
    await render(<Tag label="Watch · 132 bpm" tone="info" accessibilityLabel="Heart rate 132" />);
    expect(screen.getByLabelText('Heart rate 132')).toBeOnTheScreen();
    expect(screen.getByText('Watch · 132 bpm')).toHaveStyle({ color: lightColors.text });
  });
});
