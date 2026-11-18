# 0142. Ask for the AI consent at first use

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

Bite's chat and meals from photos send health data to Google's model: the messages, photos and
voice, and for the chat a snapshot of the profile, goals, plan and logs. The onboarding's consent
(GDPR Article 9) names other purposes, the targets and the plan, and no other recipient. A consent
covers only the purposes it names, so the AI features need one of their own. Many users never use
them: guests cannot, free users get a few meal photos a week, and only premium has the chat.

## Decision

- **One consent for both AI features**, as both send the same kind of data to the same recipient.
  It is not part of the onboarding: every user starts without it.
- **Asked at first use.** Opening Bite shows the consent in place of the chat; the photo tile opens
  it before any photo is taken. The screen says what is sent, to whom (Google Cloud, in the EU, not
  used for training) and how to withdraw it, with an unticked box beside a Read button to the
  privacy policy. Not now leaves without it.
- **Enforced by the server.** `ai_access()` answers `consent_required` until the user has
  consented, so `start_ai_call()` starts no call and both Edge Functions refuse. It is asked only of
  a user the plan lets in, so a free user who opens Bite is told about premium, and a guest about an
  account, before anything else.
- **Recorded like the other consents.** `ai_consents` keeps the version of the consent's text and
  the time, one row per consent, never changed, deleted with the user. Users give and read their
  own. `AI_CONSENT_VERSION` in the app names the text.

## Alternatives considered

- **A third box in the onboarding.** Every user would be asked about features most never use, and
  a consent given before it means anything is weaker. Asking at first use ties it to what the user
  is about to do.
- **A consent per feature.** Two screens for the same recipient and data say the same twice, and
  withdrawing one while keeping the other would leave a user unsure what Google still receives.
- **Only in the app.** The server would send data whenever an old or changed app skipped the
  screen. The refusal in `ai_access()` makes the consent hold for every client.

## Consequences

- Users who chatted with Bite before are asked on their next use.
- Withdrawing the consent, in the app and on the website, comes with #652 and #653; until then the
  only way back is deleting the account.
- A change to what the AI features send needs a new `AI_CONSENT_VERSION`, and the check in
  `ai_access()` then has to ask for that version.
