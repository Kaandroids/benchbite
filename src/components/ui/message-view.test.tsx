import { render, screen } from '@/test/render';

import { MessageView } from './message-view';

describe('MessageView', () => {
  it('shows the title and the message', async () => {
    await render(<MessageView icon="offline" title="You're offline" message="Try again later." />);
    expect(screen.getByText("You're offline")).toBeTruthy();
    expect(screen.getByText('Try again later.')).toBeTruthy();
  });
});
