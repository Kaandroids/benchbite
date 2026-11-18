// The work of request-data-export (#553, ADR 0148): the website's form asks for a link to download
// the data of the account of an email address, taken as every such link is (_shared/site_link.ts).
import { type LinkRequestContext, requestLink } from '../_shared/site_link.ts';
import { exportEmail } from './email.ts';

export function handleExportRequest(req: Request, ctx: LinkRequestContext): Promise<Response> {
  return requestLink(req, ctx, {
    sentPage: 'export-data/sent',
    what: 'export of an account',
    link: () => ({
      page: 'export-data/download',
      start: (admin, { email, ipHash, tokenHash }) =>
        admin.rpc('start_data_export', {
          p_email: email,
          p_ip_hash: ipHash,
          p_token_hash: tokenHash,
        }),
      email: exportEmail,
    }),
  });
}
