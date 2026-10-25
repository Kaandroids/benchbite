import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { useTheme } from '@/theme';

import { accountError, useSignIn } from './account';
import { EmailField, FormNote, PasswordField } from './account-fields';
import { AccountForm, OtherForm } from './account-form';

type LogInScreenProps = {
  onClose: () => void;
  /** Switches to creating an account. */
  onCreateAccount: () => void;
  /** Warns that the guest's data stays behind, for a guest who has some. */
  leavesGuestData: boolean;
};

/**
 * Logs in to an account. The app then starts again as that user, so this screen does not navigate
 * on success.
 */
export function LogInScreen({ onClose, onCreateAccount, leavesGuestData }: LogInScreenProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const signIn = useSignIn();
  const reason = signIn.error ? accountError(signIn.error) : null;

  const change = (set: (value: string) => void) => (value: string) => {
    set(value);
    // Resetting a running request would leave this screen without its answer.
    if (!signIn.isPending) {
      signIn.reset();
    }
  };

  return (
    <AccountForm
      title={t('account.logInTitle')}
      subtitle={t('account.logInSubtitle')}
      onClose={onClose}
      footer={
        <View style={{ gap: spacing.lg }}>
          {reason ? <FormNote tone="danger">{t(`account.errors.${reason}`)}</FormNote> : null}
          <Button
            label={t('account.logIn')}
            disabled={email.trim() === '' || password === ''}
            loading={signIn.isPending}
            onPress={() => signIn.mutate({ email, password })}
          />
          <OtherForm
            question={t('account.noAccount')}
            action={t('account.createOne')}
            onPress={onCreateAccount}
          />
        </View>
      }
    >
      {leavesGuestData ? <FormNote tone="warning">{t('account.guestDataStays')}</FormNote> : null}
      <EmailField value={email} onChange={change(setEmail)} editable={!signIn.isPending} />
      <PasswordField value={password} onChange={change(setPassword)} editable={!signIn.isPending} />
    </AccountForm>
  );
}
