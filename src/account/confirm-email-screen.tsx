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

import {
  accountError,
  CODE_LENGTH,
  useConfirmAccount,
  useResendCode,
  type NewAccountKind,
} from './account';
import { PASSWORD_LIMITS } from './passwords';

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
 * is confirmed, so leaving here loses nothing.
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

  const error = confirm.error ?? resend.error;
  const reason = error ? accountError(error) : null;

  return (
    <FormScreen
      title={t('account.confirmTitle')}
      subtitle={t('account.confirmSent', { email })}
      onBack={onBack}
      footer={
        <View style={{ gap: spacing.lg }}>
          {reason ? (
            <Note tone="danger">{t(`account.errors.${reason}`, PASSWORD_LIMITS)}</Note>
          ) : null}
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
    </FormScreen>
  );
}

function formatWait(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
