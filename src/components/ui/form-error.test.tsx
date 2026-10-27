import { render, screen } from '@/test/render';

import { FormError } from './form-error';

describe('FormError', () => {
  it('shows its message so that screen readers hear it as it shows', async () => {
    await render(<FormError>A food has at most 900 kcal per 100 g.</FormError>);
    expect(screen.getByText('A food has at most 900 kcal per 100 g.')).toBeTruthy();
    expect(
      screen.container.queryAll((node) => node.props.accessibilityLiveRegion === 'polite'),
    ).not.toHaveLength(0);
  });
});
