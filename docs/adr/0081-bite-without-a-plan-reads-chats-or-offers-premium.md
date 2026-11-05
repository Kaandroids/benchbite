# 0081. Bite without a plan reads the chats there are, or offers premium

- **Status:** Accepted
- **Date:** 2026-11-05

## Context

The free plan has no chat with Bite, and chats stay readable once premium has ended (ADR 0078).
Bite's tab showed all of these users one card in place of the composer, which said plans were on
their way. Now that the premium page exists (#411), the tab has to do more: a free user has nothing
to read and should see what Bite does, and a user whose premium ended should find their chats.

Bite also opens a new chat when the last one is older than 6 hours (ADR 0055), which a user who
may not chat cannot use.

## Decision

- **The plan's refusal and the chats there are pick the screen.** When `ai_access()` refuses with
  `plan_required` or `account_required`, a user with no chat to show sees a page with what Bite
  does and a way to premium, and a user with a chat reads it, with a locked field and a way to
  premium in place of the composer. A guest sees the same page and creates an account first.
- **The last chat opens however old it is** for a user who can only read, as an exception to
  ADR 0055's 6 hours. New chat in the chats leads to the page.
- **What opens is decided once for each chat, on a settled read of access.** A cached answer may be
  from before the plan changed, so the screen waits for the read under way. A plan that ends under
  an open chat locks its composer and leaves the chat on the screen.
- **A read that fails is not "no chat".** A user who can only read gets an error with a retry
  rather than the page.
- **The cards in those chats are only to read.** A meal card, a proposal or a note question offers
  no buttons and no Undo. This rule holds in the app only: the server still accepts these actions.
  They use no AI and touch only the user's own rows, and the workout limits apply on the server
  whichever way a workout changes.
- A paid plan that used up its budget stays as it was, with its card and the actions on its cards.

## Alternatives considered

- **Storing whether a user ever had premium** to pick the screen. It says nothing more than the
  chats do, and a user who deleted their chats would have an empty screen to read.
- **The same page for every user without a plan.** Chats would be out of reach, against ADR 0078.
- **Refusing the card actions on the server** in `decide_coach_proposal`, `log_coach_meal_card`,
  `undo_coach_meal_card` and on `coach_notes`, as ADR 0079 does for held workouts. There, the limit
  is what the plan sells and the database must hold it. Here nothing is gained that costs anything,
  and the extra refusals would need their own errors in every older build.
- **Leaving the card actions open.** They cost nothing, but buttons in a chat that says it comes
  with premium would be confusing, and "read, not write" would need explaining.

## Consequences

- An older build, or a direct call, can still apply a card from an old chat. That is accepted.
- Bite waits for `ai_access()` before anything shows, which adds a short wait when the answer is
  stale. A read that fails goes on at once, and the server refuses what the user may not do.
- The chats stay reachable for a user whose access was unknown when the chat opened: that chat stays,
  with Continue and all chats if it has no messages, and its composer locks once the answer comes.
