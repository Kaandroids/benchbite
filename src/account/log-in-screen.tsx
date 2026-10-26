import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { useTheme } from '@/theme';
import { LinkPrompt } from '@/components/ui/link-prompt';
import { Note } from '@/components/ui/note';
import { FormScreen } from '@/components/ui/form-screen';

import { useSignIn } from './account';
import { EmailField, PasswordField } from './account-fields';
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
 * on success.
 */
export function LogInScreen({ onClose, onCreateAccount, leavesGuestData }: LogInScreenProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const signIn = useSignIn();
  const { email, password, setEmail, setPassword, message } = useCredentialsForm(signIn);

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
            onPress={() => signIn.mutate({ email, password })}
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
