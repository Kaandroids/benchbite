# 0158. Ask again when the terms or a consent change

- **Status:** Accepted
- **Date:** 2026-11-20

## Context

A user accepts the terms of use and consents to the processing of health data once, in the
onboarding (ADR 0141), and to the AI features at their first use (ADR 0142). The server names the
current version of each text and the day it applies (ADR 0156), but nothing asked a user who
finished the onboarding again when a text changed: their acceptance stayed with the old version
for good (#689, #690).

Changed terms bind a user only once they accept them, and a consent covers only the text it was
given to. The app is released through the stores alone, so the question must come from the
server's rows, without a release.

## Decision

- **A user is asked when the server's version of the terms differs from the one they accepted
  last,** once they finished the onboarding, which asks by itself. A guest is asked like an
  account.
- **The question takes the app's place,** as a screen of its own: what changed, as the version's
  summary in the user's language or else in English; a box to tick, beside a button that opens the
  terms and never ticks it; and the button that records the answer.
- **Before the day the terms apply, "Later" puts the question off until the next day,** kept on
  the device for that user and that version. New terms are announced ahead by a row with a day in the future.
- **From that day there is no way past it.** The data stays as it is; the screen leads to the
  export of the data and to deleting the account, and to nothing else.
- **The answer is recorded by `accept_terms(version)`,** in `terms_acceptances`, the history the
  onboarding writes to. The server takes only the current version: an app that shows an older one
  is refused (`BB065`) and asks which one is current.
- **Nothing is asked while it is not known:** without the server's answer about the versions, or
  without the user's history, the app opens as before.
- **The consents are asked again the same way** when their text changes (#690), with two
  differences: there is no "Later", as the app cannot work on health data without the consent,
  and declining leads to the withdrawal the settings offer, which shows what is deleted before
  anything is (ADR 0145).
- **Every new version carries a summary of what changed,** in each language of the app.

## Alternatives considered

- **Accepting by using the app on:** no click, but silence is no acceptance of changed terms.
- **A sheet over the app:** lighter, but easy to swipe away, and from the day the terms apply the
  app behind it must not be in reach.
- **"Later" without an end:** never blocks anyone, but leaves users on terms that no longer
  exist.
- **The server refusing requests until the terms are accepted:** holds against a changed app too,
  but a check on every request for what is a matter between the user and the terms; the app's
  screen is enough, and the history shows who accepted what.
- **Comparing versions as newer or older:** the versions are dates, but the server's current
  version is the one that counts, also if it is ever set back.

## Consequences

- New terms take a row and their text on the website, nothing else: publish the text first, as
  the screen links to it.
- A user who does not accept from the day the terms apply cannot use the app, on any device,
  until they do; "Later" holds for the user who chose it, on that device.
- The question comes when the app opens or returns to the foreground, also in the middle of
  something; a workout in progress is kept and goes on after the answer.
- A build older than this screen never asks. It has to be in the first store release, or such
  builds have to be declared unsupported when terms change (ADR 0157).
