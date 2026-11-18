// The work of request-account-deletion (#449, ADR 0094): the website's form asks for a link to delete
// the account of an email address, which _shared/site_link.ts takes as for every such link.
import { type LinkRequestContext, requestLink } from '../_shared/site_link.ts';
import { deletionEmail } from './email.ts';

export function handleDeletionRequest(req: Request, ctx: LinkRequestContext): Promise<Response> {
  return requestLink(req, ctx, {
    sentPage: 'delete-account/sent',
    what: 'deletion of an account',
    link: () => ({
      page: 'delete-account/confirm',
      start: (admin, { email, ipHash, tokenHash }) =>
        admin.rpc('start_account_deletion', {
          p_email: email,
          p_ip_hash: ipHash,
          p_token_hash: tokenHash,
        }),
      email: deletionEmail,
    }),
  });
}
