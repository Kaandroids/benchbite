# 0164. Write the exercises' steps in our own words

- **Status:** Accepted
- **Date:** 2026-11-23

## Context

Each exercise of the library came with its steps in English, from the same collection as the
pictures (ADR 0008). Where that wording comes from is not known: the collection it was taken from
does not say, and the question stands unanswered there (#702). Which muscles an exercise works
and what it is called are facts; a paragraph that explains a movement is somebody's wording.

The steps were also in English alone, in an app that speaks German and Turkish too (#76), and
five exercises had none.

## Decision

- **The steps are written anew, in English, German and Turkish.** Each step says what the step
  before it said, the same positions, movements, numbers, breathing cues, tips and cautions, in
  sentences built anew. An exercise keeps its number of steps and their order, so the three
  languages line up step for step. The five exercises without steps got steps of their own.
- **They live in the repository as data:** `supabase/data/exercise-instructions.en.json`, `.de.json`
  and `.tr.json`, from an exercise's id to its steps. `pnpm import:exercises` no longer takes the
  steps of the upstream collection; it takes these, and refuses to run when an exercise lacks its
  steps in a language or has a different number of them.
- **English stays in `exercises.instructions`,** where every build reads it (ADR 0157). German and
  Turkish are in a table of their own, `exercise_instruction_translations`, readable by everyone
  and writable by nobody, as the names' translations are.
- **The app shows the steps in its language** and falls back to English. A user's own exercise has
  the steps its user wrote, in one language.
- **The credit follows:** free-exercise-db is named for the exercises' names, muscles and
  equipment.

The texts were written with the help of a language model, batch by batch from one brief, checked
by script for their structure, and are reviewed by the maintainer as any change is.

This amends ADR 0008, which took the steps from the collection and left them in English, and
ADR 0163, whose credit still named the collection for the steps.

## Alternatives considered

- **Confirm where the wording comes from:** the collection's owner does not know either, so there
  is nothing to confirm it against.
- **Keep the English steps and translate them:** a translation of a text carries that text's
  rights with it.
- **Steps written from nothing, without the old ones beside them:** the surest distance from the
  old wording, but 876 movements described from memory would describe some of them wrongly; the
  old steps say what each movement is.
- **A column for each language in `exercises`:** every build would load all languages with each
  exercise, and a new language would be a change of the table.
- **English in the translations table too:** one place for all steps, but builds that read
  `exercises.instructions` would find it empty.

## Consequences

- The app has no text left whose source is unknown, and its exercises are explained in the
  language the app is used in.
- The steps are ours to improve: a correction is a change to a data file and a generated
  migration (`pnpm import:exercises --instructions-only`).
- An exercise added to the library needs its steps written in three languages before the import
  runs.
- New wording can be wrong where the old was right. The script checks the number of steps, not
  their meaning; mistakes are found by reading, and fixed as they are found.
