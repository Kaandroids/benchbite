# 0146. Withdraw a consent from the website

- **Status:** Accepted
- **Date:** 2026-11-20

## Context

A consent must be as easy to withdraw as it was to give (GDPR Art. 7(3)). The app withdraws the
health data consent and the AI consent in Settings (ADR 0143, ADR 0144), but someone who no longer
has the app, or has lost their phone, cannot. An account can already be deleted from the website
with a link sent to its email address (ADR 0094).

## Decision

- **The website's Withdraw a consent page works as its delete page (ADR 0094).** The person chooses
  the consent and enters the account's email address; a link goes to the address the account has,
  and the page it opens says what is deleted and asks to confirm. The form answers the same, after
  the same time, whether or not the address has an account, and requests are limited per address
  and per IP as for deletion, in a table of their own.
- **The consent is chosen before the link is sent.** The link holds it, and opens a page for that
  consent, which can say exactly what goes without asking the server. The confirming form names
  the consent too, and a link withdraws only its own.
- **A link withdraws what the app does.** The app's `withdraw_ai_consent()` and
  `withdraw_health_consent()` now call `withdraw_ai_consent_of()` and
  `withdraw_health_consent_of()` for the signed-in user; `withdraw_consent_by_link()` calls them
  for the link's. It uses up the link in the same transaction, so a link that failed still works,
  and a consent withdrawn already counts as withdrawn, as in the app.
- **A link works once, for 30 minutes, and only while its address is still the account's,** as
  links to delete an account (#563). A link is made whether or not the consent is given now, so the
  email says no more than the website.
- **Two Edge Functions, `request-consent-withdrawal` and `confirm-consent-withdrawal`, take the
  forms,** without a JWT and without CORS, as those for deletion. What the two kinds of link share
  is in `_shared/site_link.ts`, and the website's confirming form in `LinkConfirm.astro`.
- **The app learns of it from the server** the next time it comes to the front (ADR 0145): a
  missing profile starts the onboarding again, and Bite asks for the AI consent again.
- **Guests cannot withdraw on the website,** as they have no address. They withdraw in the app.

## Alternatives considered

- **Choosing the consent on the page the link opens:** one link for both, but the page would have to
  ask the server which consents are given before it can say what is deleted, and the website has no
  script for that.
- **Writing to us to have a consent withdrawn:** needs someone to do it by hand, and takes longer
  than giving the consent did.
- **One table of requests for deleting and withdrawing:** the limits would hold across both, but
  the table and its function are named for deletion. Each kind keeps its own; together they allow
  twice the emails to one address.

## Consequences

- Someone with access to an account's mailbox can withdraw its consents. They could already delete
  the account (ADR 0094).
- The privacy policy links to the page once its text is written (§ 16 of the draft).
