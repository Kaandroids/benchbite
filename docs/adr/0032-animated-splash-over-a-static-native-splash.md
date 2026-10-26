# 0032. Animate the splash in the app, over a static native splash

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

The app's mark is a weight plate with a bite taken out of it. The splash screen should show the
plate being bitten as the app opens. iOS and Android draw the first frames of an app themselves,
from a static image and a background colour set at build time, before any JavaScript runs. Only
Android 12 and later can animate that native splash, with an animated vector drawable that iOS
has no counterpart for.

## Decision

The native splash screen, set through the `expo-splash-screen` config plugin, shows the whole,
unbitten plate on the brand orange, or on the dark background when the phone is in dark mode.
When the fonts and the session are ready, the root layout hides it and, in the same frame, draws
`AnimatedSplash` over the first screen: the same plate at the same size and place, which is then
bitten with Reanimated and React Native SVG, shows the name and fades out after about 1.5 seconds.
With reduced motion turned on, it only fades.

The mark's geometry lives in `src/brand/mark.ts`. The animation draws from it, and
`pnpm icons` draws the app icons and the splash image from it with `sharp`, so the icon, the
native splash and the animation cannot drift apart.

## Alternatives considered

- **An animated native splash on Android 12+:** it would only cover Android, needs a hand-made
  animated vector drawable outside Expo's config, and Android limits it to about a second.
- **A Lottie animation:** it adds a native dependency and a file made in another tool, for an
  animation that is a handful of circles.
- **Drawing the mark in Icon Composer for iOS:** its `.icon` format cannot be generated from the
  shared geometry, so the iOS icon would be the one image kept by hand. PNG variants for light,
  dark and tinted icons are generated instead.

## Consequences

- The splash takes about 1.5 seconds longer to leave than the native one would. It starts only
  once the app is ready, so it never shows a half-loaded screen.
- The native splash follows the system's light or dark setting, not the theme chosen in the
  settings. The root layout reads the system setting before applying the stored theme, so the
  animation matches the native splash and not the app.
- Changing the mark means changing `mark.ts`, running `pnpm icons` and rebuilding the native app.
