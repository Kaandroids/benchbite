# 0170. Keep Bite's chats for 30 days

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

Bite's chats, with their photos and voice messages, were kept until the user deleted them or the
account (#728). They grew without a limit: in storage and its cost, in the export (ADR 0168), and
in health data kept for no purpose of the user's, which GDPR Art. 5(1)(c) and (e) ask not to keep
longer than needed. What Bite needs to remember about the user is in its notebook (ADR 0071), not
in old chats.

## Decision

- **A chat goes 30 days after its last message,** with its messages, meal cards and proposals.
- **A chat the user never wrote in goes after 7 days.**
- **A photo or voice message goes 30 days after it was sent,** also in a chat that goes on. Its
  part in the message keeps its type and size, loses its path and says `removed`; the app shows a
  quiet note in its place, and a voice message keeps what was said as the message's text.
- **What stays:** Bite's notebook, whose notes lose the chat they came from, and the meals and
  workouts logged from Bite's cards, which are part of the logs.
- **How:** a daily pg_cron job, `remove_old_coach_chats()`, deletes the chats in SQL, and the
  delete's trigger queues their media for `purge-coach-media` (ADR 0063). An hourly job calls
  `expire-coach-media`, which removes the files past their time from storage and then marks them
  removed in their messages; if storage fails, nothing is marked and the next run tries again.
- **No notice in the app:** the privacy policy's retention table says it (#726).

## Alternatives considered

- **Longer periods (90 days for media, 12 months for chats):** turned down by the maintainer as
  keeping more than a coach's conversation needs.
- **A warning before a chat goes, or pinning a chat to keep it:** a notification or a choice for
  little gain, and pinning would keep data without a limit again.
- **Deleting each message after 30 days:** a long chat would lose its beginning while it goes on;
  the chat as a whole goes once nobody writes in it.

## Consequences

- An export holds at most about 30 days of photos and voice messages, which keeps its size small
  (ADR 0169).
- A user who comes back to a chat after a month finds it gone; Bite still knows them from its
  notebook.
- Older builds show a removed photo or voice message as absent, as its part has no path, and a
  voice message's text as a plain message.
