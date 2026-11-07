# 0094. Delete an account from the website

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

The app stores ask for a way to have an account deleted without the app. Until now the website sent people back to the app to log in and delete it there (ADR 0087), which needs the app installed and the password known. Accounts now confirm their email address (ADR 0091), so the address can stand for the account.

## Decision

- **The website's delete page asks for the account's email address and sends a link to it.** The link opens a page that says what goes, and a button deletes the account, with the same code as the app (ADR 0087). Opening the link deletes nothing, as mail scanners open links.
- **The link holds a random token of 32 bytes,** in the page address's fragment, which browsers never send to a server, so no log holds it. The database keeps only its hash, the account it belongs to, and when it stops working: 30 minutes after it was made. Deleting the account removes its links, so a link works once; if deleting fails, it still works for another try.
- **The form tells nobody which addresses have an account:** it answers with the same page, after at least 1.5 seconds, whether or not an email was sent. A link is only made for a confirmed address.
- **Requests are limited:** 3 an hour per address and 10 an hour per IP, both kept as hashes and removed after a day by a `pg_cron` job.
- **Two Edge Functions, `request-account-deletion` and `confirm-account-deletion`, take the forms.** They take no JWT, as people without the app have no session, and their CORS is off, as the browser posts a form and follows the redirect without a script reading it. They redirect to the website's pages for each outcome.
- **The email goes through Lettermint's HTTP API,** with a project token in the Edge Function secrets, as Edge Functions cannot use the usual SMTP ports. Locally it goes to Mailpit. It is in the page's language.

## Alternatives considered

- **A code in the email, typed on the website:** the person has to keep the page open, often on another device than the one with the email, and a short code can be guessed where a long token cannot.
- **Writing to us to have the account deleted:** needs someone to do it by hand, and ADR 0087 already removed it from the website.
- **The link's page served by an Edge Function:** it could hold the token in its form without a script, but the functions' own address does not serve HTML pages.

## Consequences

- The confirming page needs a few lines of script, to put the token from the address into its form: the website's only script, an exception to ADR 0088.
- Someone with access to an account's mailbox can delete the account. They could already reset its password with a code (ADR 0092).
- Each link uses one of the sender's emails, and the per-address limit keeps one person from using many.
