import { render, screen } from '@/test/render';

import { Note } from './note';

type Node = { props: { accessible?: boolean }; parent: Node | null };

function accessibleAncestor(element: Node): Node | null {
  let node = element.parent;
  while (node && !node.props.accessible) {
    node = node.parent;
  }
  return node;
}

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

  it('shows a title above the message, as one element to read', async () => {
    await render(
      <Note tone="info" title="Not medical advice">
        Your plan is an estimate.
      </Note>,
    );
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    const title = screen.getByText('Not medical advice');
    const message = screen.getByText('Your plan is an estimate.');
    // One stop for a screen reader: the nearest accessible element holds both.
    const box = accessibleAncestor(title);
    expect(box).toBe(accessibleAncestor(message));
    expect(box).toContainElement(message);
  });
});
