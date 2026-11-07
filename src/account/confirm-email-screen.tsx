import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { CodeField } from '@/components/ui/code-field';
import { FormScreen } from '@/components/ui/form-screen';
import { Note } from '@/components/ui/note';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { useTheme } from '@/theme';

import { PasswordField } from './account-fields';
import {
  accountError,
  CODE_LENGTH,
  errorField,
  useConfirmAccount,
  useResendCode,
  type NewAccountKind,
} from './account';
import {
  isPasswordTooLong,
  isPasswordValid,
  MIN_PASSWORD_LENGTH,
  PASSWORD_LIMITS,
} from './passwords';

/** How long before another code can be asked for, as `max_frequency` in `supabase/config.toml`. */
const RESEND_SECONDS = 60;

type ConfirmEmailScreenProps = {
  email: string;
  password: string;
  kind: NewAccountKind;
  /** Goes back to the form, to use another email address. */
  onBack: () => void;
  onConfirmed: () => void;
};

/**
 * Takes the code sent to a new account's email address (ADR 0091). A guest stays a guest until it
 * is confirmed, so leaving here loses nothing. After that the account exists and the form can do no
 * more, so the only way on is to save the password, which can be typed anew if Auth refuses it.
 */
export function ConfirmEmailScreen({
  email,
  password,
  kind,
  onBack,
  onConfirmed,
}: ConfirmEmailScreenProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const confirm = useConfirmAccount();
  const resend = useResendCode();
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState(password);
  const [asksPassword, setAsksPassword] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const waiting = secondsLeft > 0;

  useEffect(() => {
    if (!waiting) {
      return;
    }
    const timer = setInterval(() => setSecondsLeft((seconds) => Math.max(seconds - 1, 0)), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  const send = (token: string) =>
    confirm.mutate(
      { email, token, password: newPassword, kind },
      {
        onSuccess: onConfirmed,
        // A wrong code is typed anew. Otherwise it stays, for the button to try again.
        onError: (error) => {
          const failure = accountError(error);
          if (failure === 'invalidCode') {
            setCode('');
          } else if (errorField(failure) === 'password') {
            setAsksPassword(true);
          }
        },
      },
    );

  const change = (value: string) => {
    // The field stays editable, as taking that away would close the keyboard.
    if (confirm.isPending) {
      return;
    }
    setCode(value);
    confirm.reset();
    // The whole code needs no further press, as when the keyboard suggests it.
    if (value.length === CODE_LENGTH) {
      send(value);
    }
  };

  const sendAgain = () => {
    resend.mutate(
      { email, kind },
      {
        onSuccess: () => {
          setCode('');
          confirm.reset();
          setSecondsLeft(RESEND_SECONDS);
        },
      },
    );
  };

  const error = confirm.error ?? resend.error;
  const reason = error ? accountError(error) : null;
  const message = reason ? t(`account.errors.${reason}`, PASSWORD_LIMITS) : null;

  const changePassword = (value: string) => {
    setNewPassword(value);
    if (!confirm.isPending) {
      confirm.reset();
    }
  };

  return (
    <FormScreen
      title={confirm.accepted ? t('account.confirmPasswordTitle') : t('account.confirmTitle')}
      subtitle={
        confirm.accepted ? t('account.confirmPasswordLeft') : t('account.confirmSent', { email })
      }
      onBack={confirm.accepted ? undefined : onBack}
      footer={
        <View style={{ gap: spacing.lg }}>
          {message && !asksPassword ? <Note tone="danger">{message}</Note> : null}
          <Button
            label={t('account.confirm')}
            disabled={confirm.accepted ? !isPasswordValid(newPassword) : code.length < CODE_LENGTH}
            loading={confirm.isPending}
            onPress={() => send(code)}
          />
        </View>
      }
    >
      {asksPassword ? (
        <PasswordField
          value={newPassword}
          onChange={changePassword}
          editable={!confirm.isPending}
          error={
            isPasswordTooLong(newPassword)
              ? t('account.errors.passwordTooLong', PASSWORD_LIMITS)
              : message
          }
          hint={t('account.passwordHint', { min: MIN_PASSWORD_LENGTH })}
          isNew
        />
      ) : null}
      {confirm.accepted ? null : (
        <>
          <CodeField
            label={t('account.code')}
            value={code}
            onChange={change}
            length={CODE_LENGTH}
            invalid={reason === 'invalidCode'}
          />
          <View style={{ gap: spacing.md, alignItems: 'flex-start' }}>
            <Text color="textMuted">{t('account.confirmSpam')}</Text>
            <TextLink
              label={
                waiting
                  ? t('account.confirmResendIn', { time: formatWait(secondsLeft) })
                  : t('account.confirmResend')
              }
              align="start"
              size="regular"
              disabled={waiting || resend.isPending}
              onPress={sendAgain}
            />
            <TextLink
              label={t('account.confirmAnotherEmail')}
              align="start"
              size="regular"
              onPress={onBack}
            />
          </View>
          {kind === 'guest' ? (
            <Text variant="caption" color="textMuted">
              {t('account.confirmGuestNote')}
            </Text>
          ) : null}
        </>
      )}
    </FormScreen>
  );
}

function formatWait(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
