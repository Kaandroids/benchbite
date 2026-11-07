import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { FormScreen } from '@/components/ui/form-screen';
import { Note } from '@/components/ui/note';
import { useTheme } from '@/theme';

import { errorField, useAccountError, useSaveNewPassword } from './account';
import { PasswordField } from './account-fields';
import { isPasswordValid } from './passwords';

/**
 * After a reset code signed in to an account, asks for its new password before the app goes on
 * (ADR 0092). There is no way back: the code is used, and the old password is the one forgotten.
 */
export function NewPasswordScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const save = useSaveNewPassword();
  const [password, setPassword] = useState('');
  const { reason, message } = useAccountError(save.error);
  const onField = reason !== null && errorField(reason) === 'password';

  const change = (value: string) => {
    setPassword(value);
    if (!save.isPending) {
      save.reset();
    }
  };

  return (
    <FormScreen
      title={t('account.newPasswordTitle')}
      subtitle={t('account.newPasswordSubtitle')}
      footer={
        <View style={{ gap: spacing.lg }}>
          {message && !onField ? <Note tone="danger">{message}</Note> : null}
          <Button
            label={t('account.newPasswordSave')}
            disabled={!isPasswordValid(password)}
            loading={save.isPending}
            onPress={() => save.mutate(password)}
          />
        </View>
      }
    >
      <PasswordField
        label={t('account.newPassword')}
        value={password}
        onChange={change}
        editable={!save.isPending}
        error={onField ? message : null}
        isNew
      />
    </FormScreen>
  );
}
