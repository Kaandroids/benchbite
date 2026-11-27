# 0174. Build the image manipulator from source on iOS

- **Status:** Accepted
- **Date:** 2026-11-27

## Context

Since SDK 56 Expo links its modules on iOS as precompiled XCFrameworks. `expo-image-manipulator`,
which shrinks the photos of the user's own exercises (`src/exercises/photos.ts`) and the photos sent
to Bite, of a meal or in the chat (`src/lib/photos.ts`), comes with its dependencies precompiled
too: `SDWebImage.xcframework` and `SDWebImageWebPCoder.xcframework`, copied into
`ios/Pods/ExpoImageManipulator`. Neither carries a privacy manifest, nor a signature.

SDWebImage is on Apple's list of SDKs that need a privacy manifest, and a signature when used as a
binary ([third-party SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements)).
Since 2025-02-12 App Store Connect rejects an upload that lacks them (ITMS-91061, ITMS-91065).

## Decision

- **`expo-image-manipulator` is built from source on iOS,** listed in `expo.autolinking.ios.buildFromSource`
  in `package.json`, as Expo's guide to precompiled modules says. CocoaPods then brings SDWebImage
  5.21 and SDWebImageWebPCoder as source pods: SDWebImage's resource bundle carries its own
  `PrivacyInfo.xcprivacy`, and there is no binary SDK left to sign.
- **The other modules stay precompiled,** which keeps the build as fast as it is.

## Alternatives considered

- **Every module from source** (`usePrecompiledModules: false`): the same fix for this module, at
  the cost of a much longer build for all the others, which have no such problem.
- **Dropping the image manipulator,** sending photos as the picker gives them: larger uploads to
  storage, and photos to Bite many times larger, which cost more and can pass the 1.5 MB a function
  takes per photo, for a build problem.
- **Adding SDWebImage's manifest to the app's own:** Apple wants the manifest in the SDK's bundle,
  and its signature too, which an app cannot give a binary it did not make.

## Consequences

- The image manipulator and SDWebImage compile with the app, a little longer on a clean build.
- `hermes`, also on Apple's list, ships precompiled from React Native without a manifest of its own;
  whether App Store Connect accepts it is checked with the first upload to TestFlight (#559).
- A later SDK that ships SDWebImage with its manifest can drop the entry again.
