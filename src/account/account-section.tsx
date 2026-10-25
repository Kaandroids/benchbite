import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { useIsAccount, useSession } from '@/providers/session-provider';
import { useTheme } from '@/theme';
import { LinkPrompt } from '@/components/ui/link-prompt';

import { accountError, useSignOut } from './account';

/** The settings' account section: a guest is offered an account, an account can log out. */
export function AccountSection() {
  return useIsAccount() ? <SignedIn /> : <Guest />;
}

function Guest() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <Card style={{ gap: spacing.lg }}>
      <View style={[styles.row, { gap: spacing.md }]}>
        <IconTile name="shield" size={48} />
        <View style={styles.flex}>
          <Text variant="label">{t('settings.guestTitle')}</Text>
          <Text variant="caption" color="textMuted">
            {t('settings.guestMessage')}
          </Text>
        </View>
      </View>
      <Button label={t('settings.createAccount')} onPress={() => router.push('/account/create')} />
      <LinkPrompt
        question={t('account.haveAccount')}
        action={t('account.logIn')}
        onPress={() => router.push('/account/login')}
      />
    </Card>
  );
}

function SignedIn() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const session = useSession();
  const email = session.status === 'ready' ? session.session.user.email : undefined;
  const signOut = useSignOut();

  const logOut = () =>
    Alert.alert(t('settings.logOutTitle'), t('settings.logOutMessage'), [
      { text: t('editor.cancel'), style: 'cancel' },
      {
        text: t('settings.logOut'),
        style: 'destructive',
        // On success the app starts over as a new guest.
        onPress: () =>
          signOut.mutate(undefined, {
            onError: (error) =>
              Alert.alert(t('settings.logOutFailed'), t(`account.errors.${accountError(error)}`)),
          }),
      },
    ]);

  return (
    <Card list>
      <View style={[styles.row, { gap: spacing.md, paddingVertical: spacing.lg }]}>
        <IconTile name="account" />
        <View style={styles.flex}>
          <Text variant="caption" color="textMuted">
            {t('settings.signedInAs')}
          </Text>
          <Text variant="label" numberOfLines={1}>
            {email}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: signOut.isPending }}
        disabled={signOut.isPending}
        onPress={logOut}
        style={[
          styles.row,
          styles.logOut,
          { gap: spacing.md, borderTopColor: colors.border, opacity: signOut.isPending ? 0.4 : 1 },
        ]}
      >
        <Icon name="logOut" size={22} color="danger" />
        <Text variant="label" color="danger">
          {t('settings.logOut')}
        </Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  logOut: {
    minHeight: 52,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
