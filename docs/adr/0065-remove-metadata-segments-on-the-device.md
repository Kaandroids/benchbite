# 0065. Remove a photo's metadata segments on the device

- **Status:** Accepted
- **Date:** 2026-10-31

## Context

ADR 0062 keeps no Exif data with a photo sent to Bite: the app re-encodes each photo on the
device, which was taken to drop it, and `coach-chat` refuses a photo that still has Exif data.
Building the function (#299) showed that re-encoding alone is not enough: on iOS, the re-encoded
JPEG likely still holds a small Exif segment (APP1), written by the system's encoder. With the
function refusing every APP1 segment, every photo from an iPhone could then be refused with
`photo_has_exif`.

APP1 is also not the only segment that can say where and when a photo was taken: Photoshop's
IPTC data (APP13) can hold Exif data too, and a comment (COM) or any other application segment
(APPn) can hold any text.

## Decision

- **A photo keeps only the segments a JPEG needs.** Those are the segments of the JPEG standard
  that say how the image is coded (the frame, the scans, their tables and the restart interval),
  and three application segments, each by the name it starts with: JFIF (APP0), the colour profile
  (APP2, `ICC_PROFILE`) and Adobe's colour transform (APP14, `Adobe`).
- **The app removes every other APPn and COM segment before it sends a photo.** After scaling and
  re-encoding a photo, the app walks the JPEG's segments up to its scan and leaves out each of
  them, Exif and XMP (APP1) among them, so that neither the place nor the time a photo was taken
  is sent.
- **`coach-chat` refuses a photo with any of them left** (`photo_has_exif`), wherever it is,
  rather than removing it itself, so that what is kept is what the app sent, and an app that skips
  the step is noticed at once. A segment the standard does not define is refused as not a JPEG
  (`photo_not_jpeg`).

This amends ADR 0062, whose Exif decision said re-encoding on the device drops the data.

## Alternatives considered

- **Removing the segments in the function:** the app could send photos as they are encoded, but
  the metadata would then leave the device, and the function would keep bytes other than those
  sent.
- **Refusing only APP1:** what iOS and Android write, but APP13 and comments can hold the same
  data, and a list of what is allowed does not have to know every kind of metadata.
- **Relying on re-encoding alone:** simpler, but not what iOS does, as above.

## Consequences

- No Exif, XMP, IPTC or other metadata leaves the device, on iOS or Android.
- The app needs a small JPEG segment reader of its own, with tests, besides the function's, and
  both keep the same three application segments.
- A photo from an encoder that writes another application segment the app does not remove is
  refused until the app removes it as well.
