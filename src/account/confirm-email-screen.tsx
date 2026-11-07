import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { CodeField } from '@/components/ui/code-field';
import { FormScreen } from '@/components/ui/form-screen';
import { Note } from '@/components/ui/note';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { minutesAndSeconds } from '@/lib/time';
import { useTheme } from '@/theme';

import { PasswordField } from './account-fields';
import {
  accountError,
  CODE_LENGTH,
  errorField,
  RESEND_SECONDS,
  useAccountError,
  useConfirmAccount,
  useResendCode,
  type NewAccountKind,
} from './account';
import { isPasswordValid } from './passwords';

type ConfirmEmailScreenProps = {
  email: string;
  password: string;
  kind: NewAccountKind;
  /** Goes back to the form, to use another email address. */
  onBack: () => void;
  /** Left out when confirming starts the app again as this user, as after logging in. */
  onConfirmed?: () => void;
};

/**
 * Takes the code sent to a new account's email address (ADR 0091). A guest stays a guest until it
 * is confirmed, so leaving here loses nothing. After that the account exists and the form can do no
 * more, so the only way on is to save the password.
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
      { email, token, password, kind },
      {
        onSuccess: onConfirmed,
        // A wrong code is typed anew. Otherwise it stays, for the button to try again.
        onError: (error) => {
          if (accountError(error) === 'invalidCode') {
            setCode('');
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

  const { reason, message } = useAccountError(confirm.error ?? resend.error);

  if (confirm.accepted) {
    return (
      <SavePassword
        password={password}
        save={(newPassword) =>
          confirm.mutate(
            { email, token: code, password: newPassword, kind },
            { onSuccess: onConfirmed },
          )
        }
        saving={confirm.isPending}
        error={confirm.error}
        reset={confirm.reset}
      />
    );
  }

  return (
    <FormScreen
      title={t('account.confirmTitle')}
      subtitle={t('account.confirmSent', { email: email.trim(), length: CODE_LENGTH })}
      onBack={onBack}
      footer={
        <View style={{ gap: spacing.lg }}>
          {message ? <Note tone="danger">{message}</Note> : null}
          <Button
            label={t('account.confirm')}
            disabled={code.length < CODE_LENGTH}
            loading={confirm.isPending}
            onPress={() => send(code)}
          />
        </View>
      }
    >
      <CodeField
        label={t('account.code', { length: CODE_LENGTH })}
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
              ? t('account.confirmResendIn', { time: minutesAndSeconds(secondsLeft) })
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
    </FormScreen>
  );
}

type SavePasswordProps = {
  password: string;
  save: (password: string) => void;
  saving: boolean;
  error: unknown;
  reset: () => void;
};

/**
 * The account's address is confirmed and only its password is left, as saving it failed. There is
 * no way back, as the form can do no more; Android's back button is stopped too, and the routes
 * turn off the swipe back.
 */
function SavePassword({ password, save, saving, error, reset }: SavePasswordProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const [value, setValue] = useState(password);
  const { reason, message } = useAccountError(error);
  const onField = reason !== null && errorField(reason) === 'password';

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);

  const change = (next: string) => {
    setValue(next);
    if (!saving) {
      reset();
    }
  };

  return (
    <FormScreen
      title={t('account.confirmPasswordTitle')}
      subtitle={t('account.confirmPasswordLeft')}
      footer={
        <View style={{ gap: spacing.lg }}>
          {message && !onField ? <Note tone="danger">{message}</Note> : null}
          <Button
            label={t('account.confirm')}
            disabled={!isPasswordValid(value)}
            loading={saving}
            onPress={() => save(value)}
          />
        </View>
      }
    >
      <PasswordField
        value={value}
        onChange={change}
        editable={!saving}
        error={onField ? message : null}
        isNew
      />
    </FormScreen>
  );
}
