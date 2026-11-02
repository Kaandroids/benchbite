import { act } from '@testing-library/react-native';
import { Keyboard, type KeyboardEvent, Platform, View } from 'react-native';

import { render, screen } from '@/test/render';

import { KeyboardAvoiding, keyboardOverlap } from './keyboard-avoiding';
import { Text } from './text';

type Listener = (event: KeyboardEvent) => void;

/** A keyboard whose top is at `top` in an 844 points tall window. */
function keyboardAt(top: number): KeyboardEvent {
  return {
    duration: 250,
    easing: 'keyboard',
    startCoordinates: { screenX: 0, screenY: 844, width: 390, height: 0 },
    endCoordinates: { screenX: 0, screenY: top, width: 390, height: 844 - top },
    isEventFromThisApp: true,
  };
}

/**
 * Renders the view where it is in the window, as `measureInWindow` reports it, and returns the
 * keyboard's listeners by name.
 */
async function renderAt(frame: { y: number; height: number }) {
  const listeners: Record<string, Listener> = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation((name, listener) => {
    listeners[name] = listener as Listener;
    return { remove: jest.fn() } as unknown as ReturnType<typeof Keyboard.addListener>;
  });
  // The mocked View shares its native methods through its prototype.
  jest
    .spyOn(View.prototype as unknown as { measureInWindow: () => void }, 'measureInWindow')
    .mockImplementation((...args: unknown[]) => {
      const callback = args[0] as (x: number, y: number, width: number, height: number) => void;
      callback(0, frame.y, 390, frame.height);
    });
  await render(
    <KeyboardAvoiding>
      <Text>Field</Text>
    </KeyboardAvoiding>,
  );
  return listeners;
}

function avoider() {
  return screen.getByText('Field').parent!;
}

describe('keyboardOverlap', () => {
  it('is the part of the view below the top of the keyboard', () => {
    expect(keyboardOverlap({ y: 111, height: 699 }, 508)).toBe(302);
  });

  it('is 0 for a view above the keyboard, as in a window that shrinks for it', () => {
    expect(keyboardOverlap({ y: 111, height: 300 }, 508)).toBe(0);
  });

  it('is 0 when iOS gives no top for the keyboard, with Prefer Cross-Fade Transitions', () => {
    expect(keyboardOverlap({ y: 111, height: 699 }, 0)).toBe(0);
  });
});

describe('KeyboardAvoiding', () => {
  afterEach(() => jest.restoreAllMocks());

  it('lifts a view under a top bar by as much as the keyboard covers, not more', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    // As Bite's chat, under the safe area and the top bar, above the bottom safe area.
    const listeners = await renderAt({ y: 111, height: 699 });
    expect(avoider()).toHaveStyle({ paddingBottom: 0 });

    await act(() => listeners.keyboardWillShow!(keyboardAt(508)));
    expect(avoider()).toHaveStyle({ paddingBottom: 302 });

    await act(() => listeners.keyboardWillHide!(keyboardAt(844)));
    expect(avoider()).toHaveStyle({ paddingBottom: 0 });
  });

  it('lifts it on Android too, whose window no longer shrinks for the keyboard', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const listeners = await renderAt({ y: 0, height: 844 });

    await act(() => listeners.keyboardDidShow!(keyboardAt(500)));
    expect(avoider()).toHaveStyle({ paddingBottom: 344 });

    await act(() => listeners.keyboardDidHide!(keyboardAt(844)));
    expect(avoider()).toHaveStyle({ paddingBottom: 0 });
  });
});
