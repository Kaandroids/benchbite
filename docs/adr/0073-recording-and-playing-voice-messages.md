# 0073. Voice messages are held to record, in mono AAC, and played by one player per chat

- **Status:** Accepted
- **Date:** 2026-11-02

## Context

Bite's function takes voice messages (ADR 0072). The app has to record them, send them, and play
them back (#298), as the AI Coach mock-up shows in boards 1, 6 and 6b. Recording needs the
microphone and a native module, which the app did not have.

## Decision

- **`expo-audio` records and plays.** It is Expo's own module, in Expo Go too. Its config plugin
  asks for the microphone with a sentence that says when it is used. Background recording and
  playback stay off, so that Android asks for no foreground service.
- **A voice message is held to record.** An empty composer offers the mic where Send would be.
  The recording starts as it is held and is sent as it is let go. Sliding left first cancels it,
  and a hold shorter than half a second only says how to record. A screen reader's double tap
  starts and sends it instead. The first hold asks for the microphone without recording. A
  recording stops and is sent at a minute.
- **It is recorded as mono AAC at 64 kbit/s,** in an MP4 container: a minute is about 480 KB,
  and a second weighs a quarter of what coach-chat takes (ADR 0072). Its length is read from the
  file, as coach-chat reads it, so that a message shows the same length sent and kept. The
  loudness read while it records draws its bars; the bars of a sent message are drawn from its
  length in seconds, as no loudness is kept and the message has no other name both sent and kept.
- **One player plays the chat's voice messages,** one at a time; recording pauses it. A message
  sent now plays from its file on the device, and a kept one from the signed address its photos'
  addresses are read with. The files recorded go when the chat closes.
- **What was said comes as Bite's function writes it down,** with the `transcript` event, under
  the message; until then Bite says it is listening. A voice message refused comes back to the
  composer as a reason, to record again. A chat begun with a voice message not written down is
  called a voice message, as one begun with photos is called by them.

## Alternatives considered

- **Tap to start and tap to send:** easier to find, but two taps for every message, and messaging
  apps teach holding. Screen reader users get the taps.
- **Keeping the loudness of each message** to draw its bars: a column for decoration. Messages of
  the same length share their bars.
- **A player per message:** simpler, but every message would hold a native player.

## Consequences

- The release builds need to be made again for the native module and the microphone permission.
- The microphone's sentence is in English only, as the camera's and the photos' are.
