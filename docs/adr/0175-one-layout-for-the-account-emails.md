# 0175. One layout for the account emails

- **Status:** Accepted
- **Date:** 2026-11-27

## Context

Benchbite sends eight account emails: two from Supabase Auth, as Go templates in
`supabase/templates/` (the account code and the password code), and six from Edge Functions (the
code and the links to delete an account, the links to withdraw a consent and to download the data,
the welcome and the changed password). They were a white card on grey, in Helvetica, with the
name as plain text and no logo: functional, but not recognisably Benchbite (#750). The templates
copied the functions' layout by hand, with a comment to change them together.

The design was approved as a mock-up on 2026-11-27.

## Decision

- **One layout,** in `supabase/functions/_shared/account_email.ts`: the app icon and the name,
  the app's colours, Nunito where the client loads it, a large spaced code, one orange button with
  the ledge of the app's buttons, ticked points, and a footer with the support address, the imprint
  and the privacy policy. Bite greets only in the welcome, so a code or a deletion stays plain.
- **The Auth templates are written from it.** `_shared/auth_templates.ts` holds their words and
  builds one email per language, chosen with Go's `.Data.locale`; `pnpm emails` writes them to
  `supabase/templates/`, and a test of the functions fails while the files differ. Prettier leaves
  them as written.
- **Built for mail clients:** tables and inline styles, which Outlook and Gmail need, and the dark
  theme in a `<style>` block with `prefers-color-scheme`, for the clients that let an email choose
  (Apple Mail, iOS). Gmail recolours on its own.
- **The images are PNGs on the website,** `www.benchbite.com/images/email/`, drawn by
  `pnpm icons`: many clients block SVG, and Outlook does not round an image, so the icon's corners
  are drawn. The name beside it is text, so an email with images off still says who sent it. Every
  email keeps its plain-text part.
- **Nunito comes from the website too,** `www.benchbite.com/fonts/email/`, with a CORS header in
  `website/public/_headers` that lets mail clients load it. From Google Fonts, opening an email
  would tell Google who read it, which the website avoids for the same reason.

## Alternatives considered

- **A framework for emails** (MJML, React Email): it handles clients well, but adds a build step
  and a dependency to the Edge Functions for eight emails of one layout.
- **Writing the Auth templates by hand and checking them with a test:** the words would still be
  in two places, and the test would only compare parts of the layout.
- **Images embedded in each email** (`data:` or attachments): Gmail blocks `data:` images, and
  attachments make every email heavier.
- **Nunito from Google Fonts:** nothing to host, but every opened email would reach Google with
  the reader's address.

## Consequences

- A change to the layout or to the templates' words is followed by `pnpm emails`; the test says
  so when it is forgotten.
- The images go live with the website: deploy it before the functions and the Auth templates, or
  the first emails show no images.
- The colours repeat the app's tokens, as the Edge Functions cannot import the app's code; a
  change to `src/theme/colors.ts` that the emails should follow is made in both.
