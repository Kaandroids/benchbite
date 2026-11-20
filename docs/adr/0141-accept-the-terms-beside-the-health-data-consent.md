# 0141. Accept the terms of use beside the health data consent

- **Status:** Accepted, amended by ADR-0156 and ADR-0158
- **Date:** 2026-11-18

## Context

Terms of use bind a user only when they are pointed out before the contract is made and the user
agrees to them (§ 305 Abs. 2 BGB). The onboarding asked only for consent to process health data
(GDPR Article 9), recorded with the version of the privacy policy in `health_data_consents`, and
the app had no terms to accept. The terms are being written (#560), and the onboarding is where a
guest starts using Benchbite.

## Decision

- **A second box on the health data step.** Under the box for the health data consent, a box reads
  "I accept the Terms of use." Continue needs both. The two stay apart, as a consent under Article 9
  must not be tied to anything else.
- **Each box beside its text.** A Read button sits at the right of each box, in the same raised card
  behind a divider: the privacy policy beside the consent, the terms beside their box. The box and
  the button are two controls side by side, never one inside the other, so that reading never ticks
  the box and a screen reader reaches both. The link under the boxes is gone.
- **Recorded like the consent.** `terms_acceptances` keeps the accepted version and the time, one
  row per acceptance, never changed, deleted with the user. Users read their own; only
  `complete_onboarding()` writes them, and it refuses to save the onboarding without them (BB059),
  as it does without the consent (BB003).
- **Versioned.** `TERMS_VERSION` in the app names the terms accepted. An acceptance of an older
  version shows its box unticked, as an older consent does.

## Alternatives considered

- **A line under the start button**, "By continuing, you accept the Terms of use", on the first
  screen: lighter, before any answer, and common in other apps. A box is a clearer agreement, which
  the maintainer chose; whether the line would suffice is among the questions to the lawyer.
- **The link inside the box**, as first drawn: one tap target inside another, which ticks the box
  by mistake and hides the link from screen readers.
- **One box for both:** the health data consent must stand on its own.

## Consequences

- A guest cannot finish the onboarding without accepting the terms, and every saved onboarding
  records which terms were accepted.
- Users who finished the onboarding before this are not asked; asking again when the terms change,
  as § 12 of the draft terms foresees, needs a screen of its own outside the onboarding.
- Until the terms are published, the Read button opens the website's terms page, which still holds
  placeholders.
