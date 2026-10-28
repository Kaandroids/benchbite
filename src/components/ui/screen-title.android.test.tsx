import { Platform } from 'react-native';

import { render, screen } from '@/test/render';

import { ScreenTitle } from './screen-title';

// Android reads no lower limit for shrinking text, so only a title short enough to stay readable
// shrinks to fit there.
describe('ScreenTitle on Android', () => {
  beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'));
  afterEach(() => jest.restoreAllMocks());

  it('shrinks a title as long as the longest of the app to fit on one line', async () => {
    await render(<ScreenTitle title="Zum Mittagessen hinzufügen" />);
    const title = screen.getByRole('header', { name: 'Zum Mittagessen hinzufügen' });
    expect(title).toHaveStyle({ fontSize: 20 });
    expect(title.props.adjustsFontSizeToFit).toBe(true);
  });

  it('ends a longer one, such as a long recipe name, in an ellipsis instead', async () => {
    const name = 'Add to Grandma’s slow-cooked lentil and vegetable soup';
    await render(<ScreenTitle title={name} />);
    const title = screen.getByRole('header', { name });
    expect(title.props.adjustsFontSizeToFit).toBe(false);
    expect(title.props.numberOfLines).toBe(1);
  });
});
