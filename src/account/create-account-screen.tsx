import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';
import { LinkPrompt } from '@/components/ui/link-prompt';
import { Note } from '@/components/ui/note';

import { errorField, useCreateAccount } from './account';
import { EmailField, PasswordField } from './account-fields';
import { AccountForm } from './account-form';
import { MIN_PASSWORD_LENGTH } from './passwords';
import { useCredentialsForm } from './use-credentials-form';

type CreateAccountScreenProps = {
  onClose: () => void;
  /** Switches to logging in, as for an email address that has an account. */
  onLogIn: () => void;
  /** After the account was created. */
  onCreated?: () => void;
};

/** Creates an account with an email address and a password (ADR 0031). */
export function CreateAccountScreen({ onClose, onLogIn, onCreated }: CreateAccountScreenProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const create = useCreateAccount();
  const { email, password, setEmail, setPassword, reason, message } = useCredentialsForm(create);
  const field = reason ? errorField(reason) : null;
  const ready = email.trim() !== '' && password.length >= MIN_PASSWORD_LENGTH;

  return (
    <AccountForm
      title={t('account.createTitle')}
      subtitle={t('account.createSubtitle')}
      onClose={onClose}
      footer={
        <View style={{ gap: spacing.lg }}>
          {reason && !field ? <Note tone="danger">{message ?? ''}</Note> : null}
          <Button
            label={t('account.create')}
            disabled={!ready}
            loading={create.isPending}
            onPress={() => create.mutate({ email, password }, { onSuccess: onCreated })}
          />
          <LinkPrompt
            question={t('account.haveAccount')}
            action={t('account.logIn')}
            onPress={onLogIn}
          />
        </View>
      }
    >
      <EmailField
        value={email}
        onChange={setEmail}
        editable={!create.isPending}
        error={field === 'email' ? message : null}
        errorAction={
          reason === 'emailTaken' ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={onLogIn}>
              <Text variant="captionStrong" color="primaryText">
                {t('account.logInInstead')}
              </Text>
            </Pressable>
          ) : null
        }
      />
      <PasswordField
        value={password}
        onChange={setPassword}
        editable={!create.isPending}
        error={field === 'password' ? message : null}
        hint={t('account.passwordHint', { min: MIN_PASSWORD_LENGTH })}
        isNew
      />
    </AccountForm>
  );
}
