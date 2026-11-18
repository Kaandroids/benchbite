// The work of request-consent-withdrawal (#653, ADR 0146): the website's form asks for a link to
// withdraw one consent of the account of an email address, taken as every such link is
// (_shared/site_link.ts).
import { consentOf } from '../_shared/consents.ts';
import { type LinkRequestContext, requestLink } from '../_shared/site_link.ts';
import { withdrawalEmail } from './email.ts';

export function handleWithdrawalRequest(req: Request, ctx: LinkRequestContext): Promise<Response> {
  return requestLink(req, ctx, {
    sentPage: 'withdraw-consent/sent',
    what: 'withdrawal of a consent',
    // A form naming no consent the site offers gets no link, and the same answer.
    link: (form) => {
      const consent = consentOf(form.get('consent'));
      return consent
        ? {
            page: `withdraw-consent/${consent}`,
            start: (admin, { email, ipHash, tokenHash }) =>
              admin.rpc('start_consent_withdrawal', {
                p_email: email,
                p_ip_hash: ipHash,
                p_token_hash: tokenHash,
                p_consent: consent,
              }),
            email: (locale, to, link) => withdrawalEmail(locale, consent, to, link),
          }
        : undefined;
    },
  });
}
