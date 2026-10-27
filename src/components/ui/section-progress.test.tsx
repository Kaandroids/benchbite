import { render, screen } from '@/test/render';

import { SectionProgress } from './section-progress';

const SECTIONS = ['About you', 'Training', 'Your plan'];

describe('SectionProgress', () => {
  it('names every section and reads as the current one', async () => {
    await render(<SectionProgress sections={SECTIONS} current={1} value={0.5} />);
    for (const label of SECTIONS) {
      expect(screen.getByText(label)).toBeOnTheScreen();
    }
    expect(screen.getByRole('progressbar', { name: 'Training' })).toBeOnTheScreen();
  });

  it('counts the sections before the current one as done', async () => {
    await render(<SectionProgress sections={SECTIONS} current={1} value={0.5} />);
    expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({ now: 50 });
  });

  it('keeps the value between 0 and 1', async () => {
    await render(<SectionProgress sections={SECTIONS} current={2} value={1.5} />);
    expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({ now: 100 });
  });
});
