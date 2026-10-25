import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';
import { LinkPrompt } from '@/components/ui/link-prompt';
import { Note } from '@/components/ui/note';

import { accountError, errorField, useCreateAccount } from './account';
import { EmailField, PasswordField } from './account-fields';
import { AccountForm } from './account-form';
import { MIN_PASSWORD_LENGTH, PASSWORD_LIMITS } from './passwords';

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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const create = useCreateAccount();
  const reason = create.error ? accountError(create.error) : null;
  const field = reason ? errorField(reason) : null;
  const message = reason ? t(`account.errors.${reason}`, PASSWORD_LIMITS) : null;
  const ready = email.trim() !== '' && password.length >= MIN_PASSWORD_LENGTH;

  // A new attempt starts without the last one's error.
  const change = (set: (value: string) => void) => (value: string) => {
    set(value);
    // Resetting a running request would leave this screen without its answer.
    if (!create.isPending) {
      create.reset();
    }
  };

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
        onChange={change(setEmail)}
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
        onChange={change(setPassword)}
        editable={!create.isPending}
        error={field === 'password' ? message : null}
        hint={t('account.passwordHint', { min: MIN_PASSWORD_LENGTH })}
        isNew
      />
    </AccountForm>
  );
}
