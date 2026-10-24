import { render, screen } from '@/test/render';

import { StatColumns } from './stat-columns';
import { Text } from './text';

describe('StatColumns', () => {
  it('shows each figure over its label, and the row under them', async () => {
    await render(
      <StatColumns
        stats={[
          { value: '45:00', label: 'Time' },
          { value: 12, label: 'Sets' },
        ]}
        footer={<Text>Started 18:00</Text>}
      />,
    );
    expect(screen.getByText('45:00')).toBeTruthy();
    expect(screen.getByText('Sets')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('Started 18:00')).toBeTruthy();
  });
});
