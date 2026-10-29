# 0014. Use the system's tab bar for the main screens

- **Status:** Superseded by ADR-0048
- **Date:** 2026-10-22

## Context

After the onboarding, the app needs a way between its main areas: today's overview, workouts,
nutrition and progress. Expo Router SDK 58 offers two tab navigators: native tabs, which render
the platform's own tab bar, and JavaScript tabs, which draw a tab bar in React Native. Both are in
Expo Go.

The app otherwise draws its own components (ADR 0006), so its controls look the same on both
platforms.

## Decision

The main screens use Expo Router's native tabs (`expo-router/native-tabs`) with four tabs:
Today, Workout, Nutrition and Progress. The tab bar is tinted with the primary colour and labels
use Nunito; icons are the SF Symbols and Material Symbols the app's `Icon` already maps.

## Alternatives considered

- **JavaScript tabs**: full control over the look, so the bar could match the chunky cards of
  the onboarding. But they only imitate the platform: no glass bar on iOS 26, no Material
  navigation bar on Android, and behaviour such as scrolling to the top on a second tap and the
  minimised bar has to be built or goes without.
- **A custom tab layout** (Expo Router's headless tabs): as flexible as JavaScript tabs, with
  even more to build and test.

## Consequences

- The tab bar looks and behaves like the platform's, including accessibility and the iOS 26 glass
  design, without code of our own.
- It is the one part of the app that does not use our own components, and it can only be styled
  as far as the platform allows: on iOS 26 the system draws its background.
- Native tabs render as host components in Jest, so tests check the tabs through their titles and
  which of them is focused rather than by pressing the bar.
