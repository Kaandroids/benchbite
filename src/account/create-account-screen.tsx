import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { useTheme } from '@/theme';
import { LinkPrompt } from '@/components/ui/link-prompt';
import { Note } from '@/components/ui/note';
import { TextLink } from '@/components/ui/text-link';
import { FormScreen } from '@/components/ui/form-screen';

import { errorField, useCreateAccount, type NewAccountKind } from './account';
import { AccountReadyScreen } from './account-ready-screen';
import { ConfirmEmailScreen } from './confirm-email-screen';
import { EmailField, PasswordField } from './account-fields';
import {
  isPasswordTooLong,
  isPasswordValid,
  MIN_PASSWORD_LENGTH,
  PASSWORD_LIMITS,
} from './passwords';
import { useCredentialsForm } from './use-credentials-form';

type CreateAccountScreenProps = {
  onClose: () => void;
  /** Switches to logging in, as for an email address that has an account. */
  onLogIn: () => void;
  /** After the account was created and its email address confirmed. */
  onCreated?: () => void;
};

/** Creates an account with an email address and a password, confirmed by a code (ADR 0091). */
export function CreateAccountScreen({ onClose, onLogIn, onCreated }: CreateAccountScreenProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const create = useCreateAccount();
  const { email, password, setEmail, setPassword, reason, message } = useCredentialsForm(create);
  const field = reason ? errorField(reason) : null;
  const ready = email.trim() !== '' && isPasswordValid(password);
  const [step, setStep] = useState<
    { name: 'code'; kind: NewAccountKind } | { name: 'ready' } | null
  >(null);

  if (step?.name === 'ready') {
    return <AccountReadyScreen onContinue={() => onCreated?.()} />;
  }
  if (step?.name === 'code') {
    return (
      <ConfirmEmailScreen
        email={email.trim()}
        password={password}
        kind={step.kind}
        onBack={() => setStep(null)}
        onConfirmed={() => setStep({ name: 'ready' })}
      />
    );
  }

  return (
    <FormScreen
      title={t('account.createTitle')}
      subtitle={t('account.createSubtitle')}
      onBack={onClose}
      closes
      footer={
        <View style={{ gap: spacing.lg }}>
          {reason && !field ? <Note tone="danger">{message ?? ''}</Note> : null}
          <Button
            label={t('account.create')}
            disabled={!ready}
            loading={create.isPending}
            onPress={() =>
              create.mutate(
                { email, password },
                { onSuccess: (kind) => setStep({ name: 'code', kind }) },
              )
            }
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
            <TextLink label={t('account.logInInstead')} align="start" onPress={onLogIn} />
          ) : null
        }
      />
      <PasswordField
        value={password}
        onChange={setPassword}
        editable={!create.isPending}
        error={
          isPasswordTooLong(password)
            ? t('account.errors.passwordTooLong', PASSWORD_LIMITS)
            : field === 'password'
              ? message
              : null
        }
        hint={t('account.passwordHint', { min: MIN_PASSWORD_LENGTH })}
        isNew
      />
    </FormScreen>
  );
}
