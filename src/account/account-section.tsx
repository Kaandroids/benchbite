import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DashedButton } from '@/components/ui/dashed-button';
import { Icon } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { useIsAccount, useSession } from '@/providers/session-provider';
import { useTheme } from '@/theme';
import { LinkPrompt } from '@/components/ui/link-prompt';

import { SettingRow } from '@/components/ui/setting-row';
import { accountErrorMessage, useSignOut } from './account';

/** The settings' account section: a guest is offered an account, an account can log out. */
export function AccountSection() {
  return useIsAccount() ? <SignedIn /> : <Guest />;
}

/** The way to delete all that is the user's, guest or account, at the end of the settings. */
export function DeleteAccountButton() {
  const { t } = useTranslation();
  return (
    <DashedButton
      icon="trash"
      label={t(useIsAccount() ? 'account.delete.delete' : 'account.delete.deleteGuest')}
      tone="danger"
      onPress={() => router.push('/account/delete')}
    />
  );
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
  const { spacing } = useTheme();
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
              Alert.alert(t('settings.logOutFailed'), accountErrorMessage(t, error)),
          }),
      },
    ]);

  return (
    <>
      <Card style={[styles.row, { gap: spacing.md }]}>
        <IconTile name="account" />
        <View style={styles.flex}>
          <Text variant="caption" color="textMuted">
            {t('settings.signedInAs')}
          </Text>
          <Text variant="label" numberOfLines={1}>
            {email}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.logOut')}
          accessibilityState={{ disabled: signOut.isPending }}
          disabled={signOut.isPending}
          onPress={logOut}
          style={({ pressed }) => [
            styles.logOut,
            { opacity: signOut.isPending ? 0.4 : pressed ? 0.6 : 1 },
          ]}
        >
          <Icon name="logOut" size={22} color="danger" weight="bold" />
        </Pressable>
      </Card>
      <SettingRow
        label={t('account.changePassword')}
        hint={t('account.changePasswordHint')}
        onPress={() => router.push('/account/password')}
      />
    </>
  );
}

const styles = StyleSheet.create({
  // At the card's edge, in line with the arrows of the rows around it.
  logOut: {
    width: 44,
    height: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
});
