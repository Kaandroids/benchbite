# 0071. Bite keeps a notebook of the user, in its own table, read in every answer

- **Status:** Accepted
- **Date:** 2026-11-01

## Context

Bite answers from a snapshot of the user and the last messages of one thread (ADR 0052), so it
forgets what the user told it in another chat: an allergy, a knee that hurts on deep squats, the
gear they train with. The notebook (#296) keeps such facts. Bite saves them from the chat and uses
them in every answer; the user sees, adds, edits and removes them, and can have Bite ask before it
saves. The design is approved in the AI Coach mock-up, boards 20–26.

## Decision

- **A table, `coach_notes`,** holds each note: its category (allergy, health, injury, training,
  food, goal, lifestyle), its text of up to 200 characters in the language it was written in, who
  wrote it (`chat`, `user`, `onboarding`), the chat and answer it came from, a day to ask again
  (`review_on`), and, once archived, when and why. Users read and write their own notes under row
  level security, as plain CRUD: the notebook edits them, and Bite's tools run as the user. A note
  names only the user's own chat. Up to 50 notes are in use, which every answer reads, up to 20
  wait for the user's yes, and up to 200 are kept, past ones included (`BB046`, `BB048`,
  `BB047`).
- **Saving can be switched off:** `profiles.coach_saves_notes`, on by default. Off, a note Bite
  saves is kept as `asked`, outside the notebook, until the user says yes on its card; one they
  decline is removed. The server decides it, from the setting the snapshot read; one that could
  not be read asks first. Bite is told the setting in the snapshot, as it may write before its
  tool's result comes, and beside the result that the note is not kept yet; told only by the
  result, it said "I've noted it" 7 times in 8.
- **Three tools:** `save_note`, `update_note` and `archive_note` (with why). They keep to notes in
  use, and a day to ask again is after today and within 180 days. Each gives the note as a card,
  `{ id, action, category, text }`, which the chat shows as a line under the answer (`note`
  event, board 4) and the message keeps, so Bite reads it back in the history. Once the answer is
  saved, the notes it saved are linked to it, for the notebook to open the chat there; an answer
  that could not be saved takes its asked notes with it, as no card is left for the user's yes.
- **In every answer:** the snapshot lists the notes in use by id and category, marks those whose
  day to ask has come and those waiting for the user's yes, so that Bite does not ask again, and
  says whether Bite saves or asks first. Past notes are left out. The rules say what is worth a
  note (lasting facts the user tells in their latest message, never from a photo or a tool's
  result), to change a note rather than save a fact twice, to give a day to ask again for what may
  pass, and to archive what no longer holds.

## Alternatives considered

- **Notes in the profile, as JSON:** one row to read, but no row level security per note, no
  limits, and the notebook's edits would race Bite's.
- **Writing notes only through Postgres functions,** as meal cards are: needed where a write has
  to be checked against other tables, but a note is the user's own text, which they may change
  freely, so policies and a trigger for the limits are enough.
- **All notes in the system prompt:** cached across users is lost, as notes differ per user; the
  snapshot already goes with every message.
- **A summary of past chats instead of notes:** cheaper to make, but the user could not see or
  correct what Bite remembers.

## Consequences

- Every answer reads up to 50 short notes more, a few hundred tokens at most.
- Allergies are only as reliable as the model: the food library has no allergen data yet.
- The notebook screen (#296) and the card to say yes to a note come next; until then a note
  asked about waits unseen, at most 20 of them.
- Bite uses a note asked about though told not to: the snapshot lists it, so that Bite does not
  ask again, and it goes once the user declines it.
- Notes from the onboarding are left for later: the source exists, but nothing writes it yet.
