# 0048. Draw our own tab bar, with Bite in its middle

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

Bite, the AI coach (#38), opens from the middle of the tab bar: the mascot rises out of the bar,
blinks and bobs, and a red dot on it says a review is ready. Changing tab should move too: the
chosen tab's background slides over to it and its icon pops.

The system's tab bar (ADR 0014) can show a name, an icon, an image and a badge per tab, and can
catch a press, but it cannot let a tab rise out of the bar or animate inside it. On iOS 26 its
Liquid Glass is the part of it the maintainer likes most, and `expo-glass-effect` draws the same
glass in our own views, also in Expo Go.

## Decision

- **The tabs use Expo Router's JavaScript tabs (`expo-router/js-tabs`) with a tab bar of our
  own** (`src/components/tab-bar.tsx`): a capsule floating over the content, with Today and
  Workout, then Bite, then Nutrition and Progress.
- **On iOS 26 the capsule is Liquid Glass** (`GlassView`), when the system draws it; elsewhere,
  as on Android, it is the app's surface with a hairline border and a soft shadow. The shape,
  the layout and the motion are the same on both.
- **Bite is no tab:** it rises out of the middle on the brand's orange and opens its chat over
  the tabs, at `/bite`. It has no label, as the mascot says what it is. While it waits it bounces
  gently as off the ground, squashing a little as it lands, blinks, and now and then looks to
  either side.
- **Changing tab** glides the chosen tab's pill over to it in a fifth of a second, easing out, and
  pops its icon; the screens fade. With the system's reduced motion on, nothing moves.
- **The bar floats**, so a tab's screen leaves room under its content for it
  (`useTabBarSpace()`), and pressing the open tab again scrolls it to the top, as the system's
  bar did.
- **The bar shows only on the tabs' own screens,** as before: a screen a tab opens covers it.

## Alternatives considered

- **The system's tab bar with Bite as a plain fifth tab:** it keeps everything ADR 0014 gave,
  but Bite could not rise out of the bar or move, which is the point of the design.
- **The system's tab bar with our own Bite button laid over a gap in its middle:** close to the
  design, but the iOS 26 bar moves and shrinks as it pleases, so the button would not stay in
  place.
- **Expo Router's headless tabs:** as flexible, with more to build; the JavaScript tabs already
  give the navigation and its events.

## Consequences

- Supersedes ADR 0014. The bar is ours to change and animate, and it looks the same on both
  platforms apart from the glass.
- What the system's bar did by itself is ours now: scrolling to the top on a second press is
  built in, but the iOS 26 bar's shrinking while scrolling and Android's own navigation bar are
  gone.
- Tests find the tabs by their role and name, as any of our components, rather than as native
  host components.
