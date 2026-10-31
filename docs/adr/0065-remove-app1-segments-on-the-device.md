# 0065. Remove a photo's APP1 segments on the device

- **Status:** Accepted
- **Date:** 2026-10-31

## Context

ADR 0062 keeps no Exif data with a photo sent to Bite: the app re-encodes each photo on the
device, which was taken to drop it, and `coach-chat` refuses a photo that still has Exif data.
Building the function (#299) showed that re-encoding alone is not enough: on iOS, the re-encoded
JPEG likely still holds a small Exif segment (APP1), written by the system's encoder. With the
function refusing every APP1 segment, every photo from an iPhone could then be refused with
`photo_has_exif`.

## Decision

- **The app removes every APP1 segment before it sends a photo.** After scaling and re-encoding a
  photo, the app walks the JPEG's segments up to its scan and leaves out each APP1 segment, which
  holds Exif or XMP data, so that neither the place nor the time a photo was taken is sent.
- **`coach-chat` still refuses a photo with an APP1 segment left** (`photo_has_exif`), rather than
  removing it itself, so that what is kept is what the app sent, and an app that skips the step is
  noticed at once.

This amends ADR 0062, whose Exif decision said re-encoding on the device drops the data.

## Alternatives considered

- **Removing APP1 segments in the function:** the app could send photos as they are encoded, but
  the Exif data would then leave the device, and the function would keep bytes other than those
  sent.
- **Relying on re-encoding alone:** simpler, but not what iOS does, as above.

## Consequences

- No Exif or XMP data leaves the device, on iOS or Android.
- The app needs a small JPEG segment reader of its own, with tests, besides the function's.
