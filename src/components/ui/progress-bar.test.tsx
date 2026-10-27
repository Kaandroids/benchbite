import { render, screen } from '@/test/render';

import { ProgressBar } from './progress-bar';

// Regression: without `accessible`, the bar was no accessibility element and iOS did not read it.
const progressBar = () => screen.getByRole('progressbar', { name: 'Onboarding' });

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

  it('leaves the reading to an element around it when not accessible', async () => {
    await render(<ProgressBar value={0.5} accessible={false} />);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
