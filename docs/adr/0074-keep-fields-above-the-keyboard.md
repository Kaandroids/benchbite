# 0074. Keep fields above the keyboard with padding measured in the window

- **Status:** Accepted
- **Date:** 2026-11-02

## Context

The keyboard covered the composer of Bite's chat on phones (#398), so what the user wrote could
not be seen or sent. Fields across the app are kept above the keyboard by one component,
`KeyboardAvoiding`, which wrapped React Native's `KeyboardAvoidingView` with `behavior="padding"`
on iOS and no behaviour on Android. It failed on both:

- **iOS:** `KeyboardAvoidingView` compares the keyboard's top, in the window's coordinates, with
  its own frame from `onLayout`, which is relative to its parent. That only agrees for a view at
  the top of the window. The chat's view sits under the safe area and the top bar, so it was lifted
  by about 110 points too little, which is the height of the composer.
- **Android:** Expo SDK 58 draws edge to edge, so the window no longer shrinks for the keyboard,
  and with no behaviour the view was not lifted at all (#326).

## Decision

`KeyboardAvoiding` measures its view with `measureInWindow` each time the keyboard opens and pads
its bottom by the part of the view below the keyboard's top, on iOS and Android alike. It listens
to `keyboardWillShow` and `keyboardWillHide` on iOS, which come before the keyboard moves, and to
`keyboardDidShow` and `keyboardDidHide` on Android, which are the only ones there, and animates the
padding with `LayoutAnimation` as `KeyboardAvoidingView` does. A view that the keyboard does not
cover, as in a window that still shrinks for it, gets no padding, so the padding is never counted
twice.

## Alternatives considered

- **`KeyboardAvoidingView` with a `keyboardVerticalOffset`** of the safe area and the top bar:
  each screen would have to know what is above it, and the offset breaks when that changes.
  Measuring the view in `onLayout` instead would measure a sheet while it slides in.
- **`behavior="padding"` on Android as well:** this fixes screens whose view starts at the top of
  the window, but not the chat, for the same reason as on iOS.
- **`softwareKeyboardLayoutMode: "pan"`** in `app.json`: Android would move the whole window up,
  top bar included, which is not what a chat does, and it does not help iOS.
- **`react-native-keyboard-controller`,** which Expo recommends for chats and which Expo Go for
  SDK 58 includes: it follows the keyboard frame by frame, including on Android, but needs a
  provider at the root and a new dependency. It is the way to go if the keyboard should move more
  smoothly than this.

## Consequences

- Every screen that uses `KeyboardAvoiding` is kept above the keyboard on Android, not only the
  chat, and a view anywhere in a screen is lifted by the right amount on both platforms.
- On Android the padding comes once the keyboard is open rather than with it, since Android
  reports the keyboard only then.
- The app keeps a component of its own in place of React Native's, of about sixty lines.
