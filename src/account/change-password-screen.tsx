import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { FormScreen } from '@/components/ui/form-screen';
import { Note } from '@/components/ui/note';
import { TextLink } from '@/components/ui/text-link';
import { useSession } from '@/providers/session-provider';
import { useTheme } from '@/theme';

import { errorField, useAccountError, useChangePassword } from './account';
import { PasswordField } from './account-fields';
import { ForgotPasswordScreen } from './forgot-password-screen';
import { isPasswordValid } from './passwords';
import { startingAgain } from './use-credentials-form';

type ChangePasswordScreenProps = {
  onBack: () => void;
  onChanged: () => void;
};

/**
 * Changes the signed-in account's password, with the current one (ADR 0093). Someone who forgot it
 * resets it with a code instead, as on the log-in screen.
 */
export function ChangePasswordScreen({ onBack, onChanged }: ChangePasswordScreenProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const session = useSession();
  const email = session.status === 'ready' ? (session.session.user.email ?? '') : '';
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [forgot, setForgot] = useState(false);
  const { reason, message } = useAccountError(change.error);
  const field = reason ? errorField(reason) : null;

  if (forgot) {
    return (
      <ForgotPasswordScreen
        email={email}
        fixedEmail
        leavesGuestData={false}
        onBack={() => setForgot(false)}
      />
    );
  }

  const changeOf = startingAgain(change);

  return (
    <FormScreen
      title={t('account.changePassword')}
      onBack={onBack}
      footer={
        <View style={{ gap: spacing.lg }}>
          {message && !field ? <Note tone="danger">{message}</Note> : null}
          <Button
            label={t('account.newPasswordSave')}
            disabled={current === '' || !isPasswordValid(password)}
            loading={change.isPending}
            onPress={() => change.mutate({ current, password }, { onSuccess: onChanged })}
          />
        </View>
      }
    >
      <View>
        <PasswordField
          label={t('account.currentPassword')}
          value={current}
          onChange={changeOf(setCurrent)}
          editable={!change.isPending}
          error={field === 'current' ? message : null}
        />
        <TextLink
          label={t('account.forgotPassword')}
          align="end"
          size="regular"
          onPress={() => setForgot(true)}
        />
      </View>
      <PasswordField
        label={t('account.newPassword')}
        value={password}
        onChange={changeOf(setPassword)}
        editable={!change.isPending}
        error={field === 'password' ? message : null}
        isNew
      />
    </FormScreen>
  );
}
