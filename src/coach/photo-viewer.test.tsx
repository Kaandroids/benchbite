import { fireEvent, render, screen } from '@/test/render';

import { PhotoViewer } from './photo-viewer';

describe('PhotoViewer', () => {
  it('closes from its close button', async () => {
    const onClose = jest.fn();
    await render(<PhotoViewer uri="file:///photo.jpg" onClose={onClose} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Close photo' }));
    expect(onClose).toHaveBeenCalled();
  });
});
