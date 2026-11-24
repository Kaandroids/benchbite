# 0147. Export a user's data

- **Status:** Accepted, amended by ADR-0168
- **Date:** 2026-11-20

## Context

GDPR Art. 15 and 20 give users a copy of their data, in a format other services can read. Nothing
in Benchbite gave one. Users also need it before they withdraw the health data consent or delete
their account, which delete the data for good (ADR 0144, ADR 0087).

## Decision

- **The database gathers the export:** `export_user_data(user_id)` builds one JSON document with
  the account (id, email, when it was made, whether it is a guest) and the user's rows of every
  table that holds them, without the user's id on each row. Bite's messages come within their
  chats, a recipe's ingredients within the recipe, and the user's own exercises with their names.
  The app calls `export_my_data()` for the signed-in user, guests too; the website's link will call
  `export_user_data()` for its owner (#553, part 2), so both give the same file.
- **Each table with a user_id or owner_id is exported or left out on purpose.** `export_tables()`
  lists those exported whole, `export_nested()` those exported with the rows that hang off them,
  `export_left_out()` those left out, and a test fails for a table in none, so that a table added
  later cannot be missed. A table that hangs off another, with no user of its own, is added to the
  export by hand. Left out are the hashes and limits of links and codes, which
  last minutes, and the work queues of the moment, such as answers in flight and media to purge.
- **The service's own record of the AI is left out:** which model answered each message, its
  tokens, and the costs in `ai_usage`. They describe how Benchbite runs, not what the user gave it
  (GDPR Art. 20 covers data the user provided). A request under Art. 15 for a full copy is answered
  apart, with the lawyer's view on these columns.
- **Photos and voice messages are not in the file.** The messages name them by their path. A ZIP
  with the media is a later step; it would make the export much larger and slower.
- **The app writes the file to its cache and shares it** through the phone's share sheet with
  `expo-sharing`. The share sheet opens once the export's sheet has closed, as iOS shows no sheet
  over another. The file holds health data, so the next export deletes any earlier one first, and a
  file that could not be written is deleted at once. It is not deleted as the share sheet closes:
  on Android that is before an app that reads in the background, as Drive does, is done with it.
- **The export is offered where data is about to go:** in Settings › Privacy, in the sheets that
  withdraw a consent, and on the delete account screen.

## Alternatives considered

- **Building the export in an Edge Function:** it would need the service role to read every table,
  and the website's and the app's would differ unless both called the same code; the database
  already knows what is the user's, and reads it in one query per table.
- **A list of queries written out per table:** each new column would need a change; whole rows,
  but the user's id, keep up with the schema.
- **Sending the file by email:** health data would stay in mailboxes and on mail servers.

## Consequences

- `expo-sharing` is a native module: the app needs a new development build.
- The last export stays in the app's cache, which only the app can read, until the next export or
  until the system clears the cache.
- A column added to an exported table is exported as well, including one that should not be. A new
  column meant only for the server goes in a table of its own, or is removed in
  `export_user_data()`.
- The export grows with the user's history: a test account with 19 workouts gave 42 KB.
