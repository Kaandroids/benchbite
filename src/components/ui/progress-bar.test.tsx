import { render, screen } from '@/test/render';

import { ProgressBar } from './progress-bar';

// The bar is not an accessibility element (it has no `accessible`), so it cannot be found by role.
const progressBar = () => screen.getByLabelText('Onboarding');

describe('ProgressBar', () => {
  it('describes the progress as a percentage', async () => {
    await render(<ProgressBar value={0.426} accessibilityLabel="Onboarding" />);
    expect(progressBar()).toHaveAccessibilityValue({ min: 0, max: 100, now: 43 });
  });

  it('keeps the value between 0 and 1', async () => {
    await render(<ProgressBar value={1.5} accessibilityLabel="Onboarding" />);
    expect(progressBar()).toHaveAccessibilityValue({ now: 100 });
    await screen.rerender(<ProgressBar value={-0.2} accessibilityLabel="Onboarding" />);
    expect(progressBar()).toHaveAccessibilityValue({ now: 0 });
  });
});
