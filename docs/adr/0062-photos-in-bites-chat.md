# 0062. Photos in Bite's chat

- **Status:** Accepted, amended by ADR-0065 and ADR-0066
- **Date:** 2026-10-31

## Context

Users should be able to send Bite a photo in the chat (#299): of a meal to log, of two dishes to
choose between, of a menu or a label. The meal photo in Nutrition (ADR 0059) already estimates a
meal in one lean request, without the chat's history, snapshot or tools, and logs it in one step
(ADR 0060). In the chat, a photo is a question like any other: Bite should answer it from what it
sees and from the user's day, and log something only when that is what the user wants. A chat is
kept and read back (ADR 0050), so its photos have to be kept too, and a photo can carry the place
and time it was taken in its Exif data.

## Decision

- **A photo is part of a normal turn.** A message holds up to 3 photos, with or without text,
  sent to `coach-chat` with the device's local time, as JPEG, scaled down on the device to the
  size limits of Nutrition's photos (1.5 MB each and 3 MB together). The turn is the chat's full turn,
  with the history, the snapshot and the tools (ADR 0052), and Bite decides what the photo asks
  for: logging a meal, comparing dishes or reading a menu or a label. There is no separate path
  for meals.
- **Photos reach the model only in their own turn.** Later turns get "(Sent N photos.)" in their
  place, with Bite's answer and cards, as a question about an estimate gets it as text in
  ADR 0059.
- **Photos are kept in the private `coach-media` bucket,** as `<user id>/<thread id>/<uuid>.jpg`,
  and the message names them by path, as ADR 0050 foresaw. Only the chat function writes them,
  with the service role; users read only their own folder, through short-lived signed URLs. The
  bucket takes JPEG only, at most 1.5 MB per file.
- **Exif data is removed before a photo is kept.** The app re-encodes each photo on the device,
  which drops it, and the function refuses a photo that still has Exif data.
- **A meal is logged through a card.** Bite's tool `log_meal_card` takes the meal, the day and the
  items, as `estimate-meal` gives them (a name, a `searchName`, the grams, a confidence, the values
  per 100 g and a note), and matches each item to the food library with the same code as
  `estimate-meal` (`_shared/meal/`), so a photo in the chat and in Nutrition give the same foods
  at the same values. The meal is the one the user named, or else the one the time of day gives;
  the grams are what was eaten ("only half of it"). The card's Add logs it with
  `log_meal_estimate()` and its Undo removes it with `undo_meal_estimate()` (ADR 0060). The card
  keeps its state (pending, logged or undone), so that it shows the same when the chat is opened
  again.
- **The card's Edit changes only the grams.** Any other correction, as a wrong food or a missing
  one, is typed in the chat, and Bite answers with a new card.
- **A message with photos costs about $0.03 to $0.05,** as photos add to a turn that already
  sends the history and the snapshot. It is counted under the `coach_chat` feature and its budget
  (ADR 0051), as any other turn of the chat.

This amends ADR 0050, as `coach-media` now exists and holds the chat's photos, and ADR 0059, as
the chat estimates a meal through its full turn; Nutrition's meal photo keeps the lean request.

## Alternatives considered

- **The lean `estimate-meal` request for meals in the chat, with a separate path for other
  photos:** cheaper per meal, but the app or a first request would have to decide what a photo is
  before Bite sees it, and the estimate would not know the user's words, their day or the chat.
  A photo is rarely sent, so one full turn costs little in a month.
- **Sending the photos without keeping them:** no storage, but a chat opened again would show
  Bite's answer to a photo that is gone.
- **Sending a thread's photos with every later turn:** Bite could look at them again, but every
  turn would cost as much as the first.
- **A "What's off?" button that estimates the meal again with a note,** as Nutrition does: the
  chat already is that place, and a correction typed there reaches Bite with the photo's context.

## Consequences

- One chat answers questions about photos of any kind, and logs meals with the same foods and
  values as Nutrition.
- A photo message costs about four to six times a meal photo in Nutrition, within the user's
  monthly limit.
- The chat function now writes to storage and has to check what it writes: the type, the size and
  the Exif data.
- Photos are not yet deleted with their thread or the account. That is open in #361, with #134,
  and has to be done before the feature is released.
