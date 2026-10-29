# 0050. Bite's conversations in threads, written only by the chat function

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

Bite, the AI coach (#38), keeps its conversations, so that a chat goes on where it stopped and an
earlier one can be opened from the history (#291). A conversation holds the user's messages,
Bite's answers with the face it makes, the tools it called and what they returned, the cards it
proposed, and photos and voice. Each answer also used tokens of a model, which the usage limit
(#288) adds up.

The model behind Bite can change (ADR 0049), and a stored conversation has to outlive that.

## Decision

- **Two tables:** `coach_threads`, a conversation with its title, the time of its last message
  and when it was archived; and `coach_messages`, each message of a thread, from the user or from
  Bite.
- **A message's content is our own format:** a JSON list of parts (text, tool calls and their
  results, cards, and paths of photos and voice in storage), never a provider's request shape.
  The chat function (#292) defines and checks the parts; the table only keeps them to 50 parts
  and 64 KB.
- **Bite's messages carry their expression, model and tokens** in columns of their own, as a
  record of what each answer used. A user's message has none of them. The expressions are the
  faces Bite answers with; its thinking face only shows while it works out a reply.
- **The usage log of #288 is what counts toward a user's limit,** not these columns: meal photos
  and reviews call the model too, and never reach a conversation.
- **Only the chat function writes them,** with the service role, after it has verified the user,
  their consent and their limit: it creates the thread with its first message and adds both
  messages of a turn together. A trigger keeps the thread's last message time.
- **The user reads their own threads and messages,** renames and archives a thread, and deletes
  one with its messages. Row level security limits all of it to the owner.
- **Deleting the account deletes the threads and messages** through their foreign keys. The
  media in storage are deleted with the thread or the account when they arrive (#295, #134).

## Alternatives considered

- **Letting the app write the user's messages:** one step less in the function, but the app could
  then write tool results or messages Bite never answered, and fill the table past any limit
  the function keeps.
- **Storing each message in the provider's format:** no translation, but a change of model
  (ADR 0049) would leave every stored conversation in the old provider's shape.
- **One column per part, or a table of parts:** checked by the database, but each new kind of
  part (a card, a voice note) would need a migration, and a message is always read whole.

## Consequences

- The chat function has to validate the parts it writes; the database checks only their size.
- The app lists the history from `coach_threads` and opens a thread from `coach_messages`, both
  directly under row level security.
- A chat answer's tokens are kept twice, here and in the usage log; only the log counts.
