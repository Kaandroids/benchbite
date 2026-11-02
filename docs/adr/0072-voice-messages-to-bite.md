# 0072. Voice messages to Bite are kept as photos are, with what was said as their text

- **Status:** Accepted
- **Date:** 2026-11-02

## Context

Users want to talk to Bite instead of typing (#298): hold the mic, speak, and let go to send.
Gemini understands audio, so the voice can go to the model as it is. The design is approved in
the AI Coach mock-up, boards 1, 6 and 6b: the mic beside an empty composer, the panel while it
records, and the sent message with a play button, its length and what was said.

## Decision

- **A voice message is a message of its own.** It goes to `coach-chat` alone, without text or
  photos, as AAC in an MP4 container, up to 60 seconds and 1 MB. The function reads its length
  from the file's movie header, not from the app, and holds it to what the file weighs: at most
  32 KB a second, twice what the app records at. It refuses one that is too large
  (`voice_too_large`), too long (`voice_too_long`) or not MP4 (`voice_not_m4a`) before anything is
  asked or kept. A body larger than any message may be is refused as `too_large`, before what it
  holds is read.
- **Bite hears it in its own turn,** as an audio part before the message, which says the message
  is the voice. Later turns read what was said instead, as photos are read as "(Sent a photo.)"
  (ADR 0062).
- **What was said is written down beside the answer,** by a request of its own feature,
  `coach_voice`, so that it runs at once with the answer (one call of a feature at a time,
  ADR 0051), and is counted toward the same budget. It starts once the answer has, so that a
  message the budget refuses an answer to costs nothing more, and the worker is kept alive for it
  (ADR 0057). The app is told with a `transcript` event, and the message keeps it as its text
  part, so the chats' list, their search and Bite's history read it as any message.
- **A voice message that could not be written down is kept without text.** Bite reads that it
  could not be, and the chats' list says it is a voice message (`last_voice`, `first_voice`), as
  it does photos.
- **The audio is kept as photos are:** in the private `coach-media` bucket, in its thread's
  folder, as `<user id>/<thread id>/<uuid>.m4a`, written only by the function with the service
  role and read by its owner through signed URLs. Deleting the chat or the account queues the
  folder, and the purge removes every file in it (ADR 0063). The bucket now takes `audio/mp4` as
  well as JPEG.

## Alternatives considered

- **Writing it down on the device:** free, but the device's speech recognition varies by
  language and platform, and the model would then only read text.
- **Asking the answering request to write it down too:** one request fewer, but the answer streams
  as text, and what was said would have to be told apart from it.
- **Deleting the audio after a day,** as #298 first proposed: kept as photos are, the user can play
  it again, and it goes with its chat as everything else of it does.

## Consequences

- A voice message costs a little more than text: about 32 tokens a second of audio in the answer,
  and the request that writes it down.
- The app needs a development build with `expo-audio` and a microphone permission; the recording
  panel and the message itself come with the app's pull request.
