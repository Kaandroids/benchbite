import { render, screen } from '@/test/render';

import { SetChips } from './set-chips';

describe('SetChips', () => {
  it('shows every set and reads the marked one out in full', async () => {
    await render(
      <SetChips
        sets={[
          { text: '80 × 8', spoken: '80 kg × 8' },
          { text: '85 × 6', spoken: '85 kg × 6' },
        ]}
        marked={(index) => index === 1}
        markLabel="Best set"
      />,
    );
    expect(screen.getByText('80 × 8')).toBeTruthy();
    expect(screen.getByLabelText('Best set: 85 kg × 6')).toBeTruthy();
    expect(screen.queryByLabelText('Best set: 80 kg × 8')).toBeNull();
  });
});
