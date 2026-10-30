# 0055. Bite's chat history: named by the first message, opened by recency

- **Status:** Accepted
- **Date:** 2026-10-30

## Context

Bite's conversations are kept in threads (ADR 0050). The user should find an earlier one, go on
with it, start a new one, and rename or delete them (#295). ADR 0050 left the name of a thread to
Bite, after its first answer; that would be a call to the model for every new thread. And a
thread that is opened again sends its last 20 messages to the model with every message (ADR
0052), so going on in a long, old thread by default costs more than starting a fresh one.

## Decision

- **A thread is named after its first message from the user:** its first words, up to 40
  characters, cut where a word ends. A trigger does it, so whoever writes the message, the name
  follows; the user may rename it. No model is asked.
- **The history is one function,** `my_coach_threads(search)`: the caller's threads that are not
  archived, latest first, with the last message's text and the face of Bite's last answer. A
  search finds a word in the name or the last message only, not the whole conversation, which
  would need an index of every message for a first version.
- **Bite opens on the last thread** when its last message came in the last 6 hours, and on a new,
  empty one otherwise, with the last thread offered as "Continue" and a link to all chats. A
  conversation that goes on the same day stays one; a new day starts fresh unless the user goes
  back.
- **Deleting a thread asks nothing:** it goes from the list at once with an Undo, and is deleted
  when the Undo is gone, as Apply and Undo work in the chat. Its messages go with it (ADR 0050);
  meals the user logged and the notebook stay.

## Alternatives considered

- **Bite naming the thread:** a better name, at the cost of a model call per thread and a name
  that comes only after the first answer; the user can rename one that reads poorly.
- **Always opening the last thread:** the conversation would never end, and every message would
  carry an old, long history to the model.
- **Searching every message:** more useful, but needs a full-text index of all messages; the
  name and the last message find most chats for now.
- **Asking before deleting:** one tap more for every delete, where Undo already keeps a slip from
  losing anything.

## Consequences

Threads get a name without cost, from words the user knows. The 6 hours and the 40 characters
are settings of the app and the database; changing either changes only what comes next. A thread
deleted while the Undo is still showing, and the app is closed then, stays, as the delete happens
when the Undo goes.
