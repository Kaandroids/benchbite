import { AccessibilityInfo } from 'react-native';

import { act, fireEvent, render, screen } from '@/test/render';

import { Toast, TOAST_MS } from './toast';

describe('Toast', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['nextTick'] }));
  afterEach(() => jest.useRealTimers());

  it('announces its message and hides after a while', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const onHide = jest.fn();
    await render(<Toast message="Milk removed" onHide={onHide} />);
    expect(screen.getByText('Milk removed')).toBeTruthy();
    expect(announce).toHaveBeenCalledWith('Milk removed');

    await act(() => jest.advanceTimersByTime(TOAST_MS));
    expect(onHide).toHaveBeenCalled();
  });

  it('runs its action and hides', async () => {
    const onPress = jest.fn();
    const onHide = jest.fn();
    await render(
      <Toast message="Milk removed" action={{ label: 'Undo', onPress }} onHide={onHide} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    expect(onPress).toHaveBeenCalled();
    expect(onHide).toHaveBeenCalled();
  });
});
