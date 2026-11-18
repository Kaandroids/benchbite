# 0143. Delete Bite's data when the AI consent is withdrawn

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

Bite's chats, the photos and voice messages in them, and Bite's notebook rest on the consent to
the AI features alone (ADR 0142). A consent must be as easy to withdraw as to give (GDPR Art. 7(3)),
and once it is withdrawn, data that has no other basis must be deleted (Art. 17(1)(b)). Until now
only deleting the account removed this data. The app (#652) and the website (#653) will both offer
the withdrawal, so it belongs on the server, in one place.

## Decision

- **One function, `withdraw_ai_consent()`,** called via `rpc()`, does everything in one
  transaction, so that nothing is left half deleted. It refuses a user with no current consent
  (BB060).
- **Recorded, never changed.** `ai_consent_withdrawals` keeps when the consent was withdrawn, as
  `ai_consents` keeps when it was given. Only a consent given after the last withdrawal counts, so
  Bite and meals from photos ask for it again.
- **Deleted:** the user's chats with their messages, meal cards and proposals; through the delete of
  the threads, their photos and voice messages are queued for the purge of coach media (ADR 0063);
  Bite's notebook; and the stops of answers.
- **Kept, as they have another basis:** meals and workouts logged from Bite's cards, which are part
  of the logs under the health data consent; `ai_usage`, which holds no health data and counts toward
  the plan's budget; and the consents and withdrawals themselves, as proof (Art. 7(1)).

## Alternatives considered

- **Keep the chats and stop only new processing.** Withdrawal ends the only basis for keeping them;
  keeping them would need another, which there is not.
- **Anonymise instead of deleting.** Chat text, photos and voice cannot be made anonymous in any
  reliable way.
- **Delete in the app.** The website must do the same, and a failure between steps could leave part
  of the data behind; one transaction on the server avoids both.
- **Delete the logged meals too.** They are the user's food log, which the health data consent
  covers; deleting them would take away data the user still wants and may keep.

## Consequences

- The app and the website only call the function and say beforehand what it deletes.
- Deleted data stays in the database's backups until they expire; the privacy policy must say how
  long.
- A chat answer running while the consent is withdrawn can still save its last message into a
  thread that is gone, which fails; it starts no new chat, as `ai_access()` refuses the next call.
