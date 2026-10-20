# 0006. Style the app with StyleSheet and theme tokens

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

The onboarding and every screen after it need a consistent look in light and dark mode, with a
distinctive, playful style: raised buttons and cards, haptics and small animations. Development
happens in Expo Go, so the approach must not require a development build. The project also uses
the React Compiler.

## Decision

Styles are written with React Native's `StyleSheet` and read their values from theme tokens in
`src/theme/`: colours for light and dark mode, a type scale, spacing and radii. A `useTheme()`
hook returns the tokens for the system's colour scheme. Components never use raw colour values.

The building blocks are our own components in `src/components/ui/`, built on React Native
primitives, Reanimated and `expo-haptics`. Icons come from `expo-symbols` (SF Symbols on iOS,
Material Symbols on Android). The typeface is Nunito.

The palette was chosen from rendered previews: a vivid orange (`#FF6A10`) on neutral greys,
with a graphite dark mode. Every text colour meets WCAG AA for its use; filled buttons use a
slightly deeper orange (`#F25A00`) so that their white 18 pt bold labels reach 3:1.

## Alternatives considered

- **NativeWind or Uniwind** (Tailwind classes): fast to write, but adds a compile step, keeps
  the tokens in Tailwind configuration and hides plain React Native styling behind class names.
- **Unistyles**: fast and well-suited to theming, but contains native code and does not run in
  Expo Go.
- **Expo UI's native components** (SwiftUI and Jetpack Compose): look native on each platform,
  which is the opposite of the consistent, branded look the onboarding needs, and are harder
  to customise.

## Consequences

- No extra dependency or build step for styling, and everything works in Expo Go.
- Tokens are plain TypeScript, so a wrong token name is a type error.
- Repeated layout code is more verbose than utility classes; shared components keep this in
  check.
- Components re-read the theme on every render. This is cheap, and the React Compiler memoises
  the derived styles.
