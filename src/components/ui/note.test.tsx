import { render, screen } from '@/test/render';

import { Note } from './note';

describe('Note', () => {
  it('announces an error', async () => {
    await render(<Note tone="danger">No connection.</Note>);
    expect(screen.getByRole('alert')).toHaveTextContent('No connection.');
  });

  it('does not announce a warning as an error', async () => {
    await render(<Note tone="warning">Your data stays behind.</Note>);
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    expect(screen.getByText('Your data stays behind.')).toBeOnTheScreen();
  });
});
