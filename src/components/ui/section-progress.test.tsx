import { render, screen } from '@/test/render';

import { SectionProgress } from './section-progress';

const SECTIONS = ['About you', 'Training', 'Your plan'];

describe('SectionProgress', () => {
  it('names every section and reads as the current one', async () => {
    await render(<SectionProgress sections={SECTIONS} current={1} value={0.5} overall={0.6} />);
    for (const label of SECTIONS) {
      expect(screen.getByText(label)).toBeOnTheScreen();
    }
    expect(screen.getByRole('progressbar', { name: 'Training' })).toBeOnTheScreen();
  });

  // Sections differ in length, so the bars alone would misstate how far the user is.
  it('reads the progress through the whole flow, not through the bars', async () => {
    await render(<SectionProgress sections={SECTIONS} current={0} value={1} overall={0.55} />);
    expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({ now: 55 });
  });

  it('keeps the progress between 0 and 1', async () => {
    await render(<SectionProgress sections={SECTIONS} current={2} value={1.5} overall={1.5} />);
    expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({ now: 100 });
  });
});
