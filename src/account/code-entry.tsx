import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { CodeField } from '@/components/ui/code-field';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { minutesAndSeconds } from '@/lib/time';
import { useTheme } from '@/theme';

import { accountError, CODE_LENGTH, RESEND_SECONDS, useAccountError } from './account';

/** The wait before another code can be asked for, counting down from when one was sent. */
export function useResendWait() {
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const waiting = secondsLeft > 0;

  useEffect(() => {
    if (!waiting) {
      return;
    }
    const timer = setInterval(() => setSecondsLeft((seconds) => Math.max(seconds - 1, 0)), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  return { secondsLeft, waiting, restart: () => setSecondsLeft(RESEND_SECONDS) };
}

/** A request to Supabase, as a mutation holds it. */
type Request<V> = {
  mutate: (
    variables: V,
    options?: { onSuccess?: () => void; onError?: (error: Error) => void },
  ) => void;
  isPending: boolean;
  error: unknown;
  reset: () => void;
};

type CodeEntryOptions<C, R> = {
  /** Checks a code, with what `checkWith` makes of it. */
  check: Request<C>;
  checkWith: (token: string) => C;
  onChecked?: () => void;
  /** Sends a new code. */
  resend: Request<R>;
  resendWith: R;
  /** Checks the code once all of it is in; off where checking does what cannot be undone. */
  submitWhenFull?: boolean;
};

/**
 * What a code screen does with the code: checks it once all of it is in, unless told to wait for
 * the button, has a wrong one typed anew, and sends a new one when asked. Typing starts a new
 * attempt, without the errors before it.
 */
export function useCodeEntry<C, R>({
  check,
  checkWith,
  onChecked,
  resend,
  resendWith,
  submitWhenFull = true,
}: CodeEntryOptions<C, R>) {
  const [code, setCode] = useState('');
  const wait = useResendWait();

  const submit = (token: string) =>
    check.mutate(checkWith(token), {
      onSuccess: onChecked,
      // A wrong code is typed anew. Otherwise it stays, for the button to try again.
      onError: (error) => {
        if (accountError(error) === 'invalidCode') {
          setCode('');
        }
      },
    });

  const change = (value: string) => {
    // The field stays editable, as taking that away would close the keyboard.
    if (check.isPending) {
      return;
    }
    setCode(value);
    check.reset();
    if (!resend.isPending) {
      resend.reset();
    }
    // The whole code needs no further press, as when the keyboard suggests it.
    if (submitWhenFull && value.length === CODE_LENGTH) {
      submit(value);
    }
  };

  const sendAgain = () =>
    resend.mutate(resendWith, {
      onSuccess: () => {
        setCode('');
        check.reset();
        wait.restart();
      },
    });

  const { reason, message } = useAccountError(check.error ?? resend.error);
  return {
    code,
    /** Whether all of the code is in. */
    full: code.length === CODE_LENGTH,
    change,
    submit: () => submit(code),
    sendAgain,
    wait,
    reason,
    message,
    checking: check.isPending,
    resending: resend.isPending,
  };
}

type CodeEntryProps = {
  entry: ReturnType<typeof useCodeEntry>;
  /** More links under the one to send again. */
  children?: ReactNode;
};

/** The boxes for a code from an email, and a way to have it sent again once the wait is over. */
export function CodeEntry({ entry, children }: CodeEntryProps) {
  const { code, change, reason, wait, sendAgain, resending } = entry;
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <>
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
            wait.waiting
              ? t('account.confirmResendIn', { time: minutesAndSeconds(wait.secondsLeft) })
              : t('account.confirmResend')
          }
          align="start"
          size="regular"
          disabled={wait.waiting || resending}
          onPress={sendAgain}
        />
        {children}
      </View>
    </>
  );
}
