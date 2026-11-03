import { StyleSheet } from 'react-native';

import { fireEvent, render, screen } from '@/test/render';

import { PhotoViewer } from './photo-viewer';

describe('PhotoViewer', () => {
  it('keeps its close button clear of the status bar, and closes', async () => {
    const onClose = jest.fn();
    await render(<PhotoViewer uri="file:///photo.jpg" onClose={onClose} />);
    const close = screen.getByRole('button', { name: 'Close photo' });
    // Under the test's status bar, 47 high, with the usual space.
    let bar = close.parent;
    while (bar && !StyleSheet.flatten(bar.props.style)?.paddingTop) {
      bar = bar.parent;
    }
    expect(StyleSheet.flatten(bar?.props.style).paddingTop).toBe(47 + 12);
    await fireEvent.press(close);
    expect(onClose).toHaveBeenCalled();
  });
});
