import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { CodeField } from '@/components/ui/code-field';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { minutesAndSeconds } from '@/lib/time';
import { useTheme } from '@/theme';

import { CODE_LENGTH, RESEND_SECONDS } from './account';

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

type CodeEntryProps = {
  code: string;
  onChange: (code: string) => void;
  /** Turns the boxes red, as for a wrong code. */
  invalid: boolean;
  wait: ReturnType<typeof useResendWait>;
  onResend: () => void;
  resending: boolean;
  /** More links under the one to send again. */
  children?: ReactNode;
};

/** The boxes for a code from an email, and a way to have it sent again once the wait is over. */
export function CodeEntry({
  code,
  onChange,
  invalid,
  wait,
  onResend,
  resending,
  children,
}: CodeEntryProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <>
      <CodeField
        label={t('account.code', { length: CODE_LENGTH })}
        value={code}
        onChange={onChange}
        length={CODE_LENGTH}
        invalid={invalid}
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
          onPress={onResend}
        />
        {children}
      </View>
    </>
  );
}
