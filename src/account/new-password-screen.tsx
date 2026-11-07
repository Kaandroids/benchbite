import { useTranslation } from 'react-i18next';

import { useSaveNewPassword } from './account';
import { NewPasswordForm } from './new-password-form';

/**
 * After a reset code signed in to an account, asks for its new password before the app goes on
 * (ADR 0092). The code is used, and the old password is the one forgotten.
 */
export function NewPasswordScreen() {
  const { t } = useTranslation();
  const save = useSaveNewPassword();
  return (
    <NewPasswordForm
      title={t('account.newPasswordTitle')}
      subtitle={t('account.newPasswordSubtitle')}
      label={t('account.newPassword')}
      saveLabel={t('account.newPasswordSave')}
      saving={save.isPending}
      error={save.error}
      reset={save.reset}
      onSave={(password) => save.mutate(password)}
    />
  );
}
