# 0133. Bite proposes changes to a note, which the user applies

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Bite's notebook (ADR 0071) gave Bite three tools: `save_note`, `update_note` and `archive_note`.
The last two changed or archived a note right away. Every other change Bite makes to the user's
data is a proposal the user applies on a card (ADR 0058). Text in a photo the user sends could
steer Bite into rewriting a note or moving it to past notes. That reaches only the user's own data,
but it is data every later answer reads, such as an allergy or an injury, and the user would only
see a line under the answer saying it changed (#534).

## Decision

- **`update_note` and `archive_note` propose.** Each makes a proposal of a new kind, `note` or
  `note_archive`, in `coach_proposals`, through `propose_coach_change()`. The tools keep their
  names, which the app knows for its status lines. A proposal names the note by its id. `note`
  names what changes, of the category, the text and the day to ask again; a day given as null
  clears it. `note_archive` names why.
- **The same proposal rules as the others.** A proposal is made only for a note of the user's in
  use: not archived and not waiting for their yes (`P0002`). It keeps the note as it was, so that
  `decide_coach_proposal()` applies it only while the note is still so (`BB035`). Undo puts the
  note back as it was, or back in use. The notebook changes notes without the user's lock, and
  archiving one there takes it after the note's row, so proposing and deciding lock the note's row
  first, in the same order. A newer proposal for the same note in the thread replaces one still
  pending (ADR 0077), and a change keeps what the change it replaces changed and it does not, so
  that asking for a later day never drops a new text the user has not applied yet.
- **Cards as in the approved mock-up.** "Change this note?" shows the text as it was, struck
  through, over the new one, and the day to ask again when it changes. "Move to past notes?" shows
  the note, why, and that it can be restored. Applied, the card folds into "Changed in notebook"
  or "Moved to past notes", with Undo.
- **`save_note` stays as it is.** A new note is saved, or asked about when saving from chats is off
  (ADR 0071). It adds a note but changes none the user has, and the rules already keep notes from
  photos and tools' results.

## Alternatives considered

- **Leave the two tools out of turns with photos:** this needs no new UI. But a change would still
  happen without the user's say, and text the user pastes could steer Bite as a photo does.
- **Confirm in the notebook rather than in the chat:** the user would have to leave the chat to
  decide. The chat already shows a card for every other proposal.

## Consequences

- Bite cannot change or archive a note without the user's tap, and every note change can be undone
  from its card.
- A change the user asks for now takes a tap as well, as changes to workouts and targets do.
- An app that does not know the new kinds leaves their cards out (`SHOWN_PROPOSAL_KINDS`). Bite's
  reply then mentions a change the user cannot apply there.
- Earlier messages keep their `updated` and `archived` note lines from ADR 0071.
