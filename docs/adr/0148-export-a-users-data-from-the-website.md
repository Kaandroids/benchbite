# 0148. Export a user's data from the website

- **Status:** Accepted, amended by ADR-0168
- **Date:** 2026-11-20

## Context

The app exports a user's data (ADR 0147). Someone without the app, or with a lost phone, still has
the right to a copy (GDPR Art. 15 and 20), as they can already delete their account (ADR 0094) and
withdraw a consent (ADR 0146) on the website.

## Decision

- **The website's Export your data page works as its other link pages.** The person enters the
  account's email address, a link goes to the address the account has, and the page it opens
  downloads the file. The form answers the same, after the same time, whether or not the address
  has an account, and requests are limited per address and per IP as for the other links, in a
  table of their own.
- **The file is the app's:** `export_data_by_link()` calls `export_user_data()` for the link's
  account, while the link works and its address is still the account's (#563).
- **A link works for 30 minutes, as often as needed,** unlike the other links, which work once: a
  download can fail without the server knowing, and downloading again changes nothing.
- **Nothing goes by email but the link.** The `download-data-export` Edge Function answers the
  page's form with the file itself, as an attachment that no cache keeps (`no-store`), so the
  health data reaches only the browser that asked. The page's button is the usual one, not the red
  one of the other links, and may be pressed again.
- **Two Edge Functions, `request-data-export` and `download-data-export`, take the forms,**
  without a JWT and without CORS, as those of the other links (`_shared/site_link.ts`).
- **Guests export in the app,** as they have no address.

## Alternatives considered

- **Attaching the file to the email:** the health data would stay in mailboxes and on mail servers,
  and the email would grow with the user's history.
- **A link that works once:** a download cut off on the way would need a new link and a new email.
- **A link to a file kept on the server:** the export would be stored, and need deleting, when it
  can be made in the moment for each download.

## Consequences

- Someone with access to an account's mailbox can download its data for 30 minutes. They could
  already delete the account (ADR 0094).
- Each download builds the export again, a few milliseconds for a user's history.
