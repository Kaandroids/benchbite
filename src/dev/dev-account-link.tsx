import { router } from 'expo-router';

import { useSignIn } from '@/account/account';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';

import { canUseDevAccount, DEV_ACCOUNT } from './dev-account';

/**
 * Signs in to the seeded dev account, which has finished the onboarding, and opens the app; only
 * in development against the local database. The text is for developers, so it is not translated.
 */
export function DevAccountLink() {
  const signIn = useSignIn();
  if (!canUseDevAccount()) {
    return null;
  }
  return (
    <>
      <TextLink
        label={signIn.isPending ? 'Signing in…' : 'Use the dev account'}
        tone="muted"
        size="small"
        onPress={() => signIn.mutate(DEV_ACCOUNT, { onSuccess: () => router.replace('/') })}
      />
      {signIn.isError ? (
        <Text variant="caption" color="danger" align="center">
          No dev account. Run pnpm supabase db reset to seed it.
        </Text>
      ) : null}
    </>
  );
}
