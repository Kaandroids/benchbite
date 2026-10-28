import { accountError, useSignIn } from '@/account/account';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';

import { canUseDevAccount, DEV_ACCOUNT } from './dev-account';

/**
 * Signs in to the seeded dev account, which has finished the onboarding; only in development
 * against the local database. As with logging in, the app then starts again as that account, so
 * the link does not navigate. The text is for developers, so it is not translated.
 */
export function DevAccountLink({ note }: { note?: string }) {
  const signIn = useSignIn();
  if (!canUseDevAccount()) {
    return null;
  }
  const error = signIn.isError ? accountError(signIn.error) : null;
  return (
    <>
      <TextLink
        label={signIn.isPending ? 'Signing in…' : 'Use the dev account'}
        tone="muted"
        size="small"
        onPress={() => signIn.mutate(DEV_ACCOUNT)}
      />
      {note ? (
        <Text variant="caption" color="textMuted" align="center">
          {note}
        </Text>
      ) : null}
      {error ? (
        <Text variant="caption" color="danger" align="center">
          {error === 'invalidCredentials'
            ? 'No dev account. Run pnpm supabase db reset to seed it.'
            : error === 'offline'
              ? 'The local Supabase cannot be reached. Is it running, and on this network?'
              : signIn.error?.message}
        </Text>
      ) : null}
    </>
  );
}
