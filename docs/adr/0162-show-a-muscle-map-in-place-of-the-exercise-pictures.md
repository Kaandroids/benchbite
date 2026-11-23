# 0162. Show a muscle map in place of the exercise pictures

- **Status:** Accepted
- **Date:** 2026-11-23

## Context

The exercise library came with two pictures for each exercise, the start and the end of a rep
(ADR 0008). The rights to those pictures are not known: the collection they come from says they
were gathered from the internet and advises against commercial use, so the licence of the library
does not cover them, and the app cannot be released with them (#702).

Without them an exercise would show its name, muscles and steps alone, and every list would lose
its thumbnails. What the app does know about each of its 876 exercises is which muscles it trains
first and which ones help.

## Decision

- **A body map stands where the pictures stood.** The exercise screen shows the body from the
  front and from the back. The muscles an exercise trains first are drawn in the brand colour, the
  ones that help in a paler one, the rest of the body in grey. The muscle names below the map say
  the same in words, so the map is a picture that screen readers pass over, named only by its side.
- **Lists show the part of the body that matters.** A thumbnail is too small for the whole figure,
  so it shows the upper body, the thighs and hips, or the calves, from the side where the first
  muscle the exercise trains is.
- **The map is drawn in the app,** from the exercise's `primary_muscles` and `secondary_muscles`,
  with [react-native-body-highlighter](https://github.com/HichamELBSI/react-native-body-highlighter)
  (MIT) on `react-native-svg`. No picture is stored or downloaded, and the map follows the light
  and the dark theme through two colour tokens of its own.
- **The drawing has fewer parts than the library has muscles.** Abductors are drawn as the glutes,
  lats and the middle back as the upper back; the abdominals fill the abs and the obliques.
- **The user's own exercises keep their photos** (ADR 0027). One without a photo shows the map.
- **The app no longer asks for the library's pictures.** `image_paths` stays in the table and the
  files stay in the bucket for the builds that still show them (ADR 0157); taking them out of the
  repository and the bucket is left to #702.

This replaces what ADR 0008 decided about images. Its decisions on the library's data stand.

## Alternatives considered

- **A licensed set of pictures or animations:** three vendors were looked at. All of them forbid
  publishing their raw files, and this repository is public, so the files would have to be kept
  and uploaded from elsewhere; their exercises would also have to be matched to ours one by one.
- **Pictures of our own, drawn or rendered:** the only way to show the movement itself, and the
  plan for the most used exercises (#706), but far too much work to cover every exercise before a
  release.
- **No picture at all:** the least work, and the weakest screen for a beginner.
- **Map pictures made ahead and stored,** two for each exercise: nothing to draw on the phone, but
  1,752 files to make, store and download, in one theme only.
- **Our own drawing of the body:** no dependency, but an anatomical drawing is a work of its own,
  and the library's is good and free to use.
- **The whole figure in thumbnails:** at 40 to 64 points the trained muscle is a few points wide.

## Consequences

- Every exercise has a picture again, the user's own included, and none of them has to be
  licensed, stored or loaded. Lists open without waiting for pictures.
- The map says which muscles work, not how the movement goes. Until the animations of #706, the
  steps alone describe it.
- Each thumbnail draws the figure's paths, where a picture was one image. Lists are virtualised,
  so only the rows on screen are drawn.
- The library is a new dependency, credited on the licences screen with the others (ADR 0160).
- Exercises with the same first muscle look the same in a list; their names tell them apart.

## Note of 2026-11-23: workouts

A workout shows the muscles it trains too (#304): those any of its exercises trains first in the
brand colour, those that only help in the paler one. Its small tile shows the whole figure from the
front and the back, at 44 to 64 points, which the alternatives above turned down for exercises. A
workout trains several parts of the body, often on both sides, and a zone or one side would hide
some of them; an exercise trains one, and its thumbnail keeps the zoomed zone. A workout's screen
shows both figures large, with the muscles in words below them, in place of its subtitle's.
