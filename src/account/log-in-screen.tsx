import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { useTheme } from '@/theme';
import { LinkPrompt } from '@/components/ui/link-prompt';
import { Note } from '@/components/ui/note';
import { FormScreen } from '@/components/ui/form-screen';

import { accountError, useResendCode, useSignIn } from './account';
import { EmailField, PasswordField } from './account-fields';
import { ConfirmEmailScreen } from './confirm-email-screen';
import { useCredentialsForm } from './use-credentials-form';

type LogInScreenProps = {
  onClose: () => void;
  /** Switches to creating an account. */
  onCreateAccount: () => void;
  /** Warns that the guest's data stays behind, for a guest who has some. */
  leavesGuestData: boolean;
};

/**
 * Logs in to an account. The app then starts again as that user, so this screen does not navigate
 * on success. An account whose email address was never confirmed goes on to its code.
 */
export function LogInScreen({ onClose, onCreateAccount, leavesGuestData }: LogInScreenProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const signIn = useSignIn();
  const resend = useResendCode();
  const { email, password, setEmail, setPassword, message } = useCredentialsForm(signIn);
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <ConfirmEmailScreen
        email={email}
        password={password}
        kind="new"
        onBack={() => setConfirming(false)}
      />
    );
  }

  const logIn = () =>
    signIn.mutate(
      { email, password },
      {
        onError: (error) => {
          if (accountError(error) === 'emailNotConfirmed') {
            // Refused only within a minute of the last code, which then still works.
            resend.mutate({ email, kind: 'new' });
            setConfirming(true);
          }
        },
      },
    );

  return (
    <FormScreen
      title={t('account.logInTitle')}
      subtitle={t('account.logInSubtitle')}
      onBack={onClose}
      closes
      footer={
        <View style={{ gap: spacing.lg }}>
          {message ? <Note tone="danger">{message}</Note> : null}
          <Button
            label={t('account.logIn')}
            disabled={email.trim() === '' || password === ''}
            loading={signIn.isPending}
            onPress={logIn}
          />
          <LinkPrompt
            question={t('account.noAccount')}
            action={t('account.createOne')}
            onPress={onCreateAccount}
          />
        </View>
      }
    >
      {leavesGuestData ? <Note tone="warning">{t('account.guestDataStays')}</Note> : null}
      <EmailField value={email} onChange={setEmail} editable={!signIn.isPending} />
      <PasswordField value={password} onChange={setPassword} editable={!signIn.isPending} />
    </FormScreen>
  );
}
