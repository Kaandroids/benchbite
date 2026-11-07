import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { FormScreen } from '@/components/ui/form-screen';
import { Note } from '@/components/ui/note';
import { useTheme } from '@/theme';

import {
  CODE_LENGTH,
  errorField,
  useAccountError,
  useConfirmReset,
  useSendResetCode,
} from './account';
import { EmailField } from './account-fields';
import { CodeEntry, useCodeEntry } from './code-entry';
import { startingAgain } from './use-credentials-form';

type ForgotPasswordScreenProps = {
  /** What the log-in form held, to start from. */
  email: string;
  /** Sends the code to this email only, for the account signed in, which stays the one reset. */
  fixedEmail?: boolean;
  /** Warns that the guest's data stays behind, for a guest who has some. */
  leavesGuestData: boolean;
  onBack: () => void;
};

/**
 * Sends a code to an account's email address and takes it (ADR 0092). The code signs in to the
 * account, and the app then asks for the new password, so this screen does not navigate on success.
 */
export function ForgotPasswordScreen({
  email: given,
  fixedEmail = false,
  leavesGuestData,
  onBack,
}: ForgotPasswordScreenProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const send = useSendResetCode();
  const [email, setEmail] = useState(given);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { reason, message } = useAccountError(send.error);
  const field = reason ? errorField(reason) : null;

  if (sentTo !== null) {
    return <ResetCodeScreen email={sentTo} onBack={() => setSentTo(null)} />;
  }

  const change = startingAgain(send)(setEmail);

  return (
    <FormScreen
      title={t('account.resetTitle')}
      subtitle={t('account.resetSubtitle')}
      onBack={onBack}
      footer={
        <View style={{ gap: spacing.lg }}>
          {message && field !== 'email' ? <Note tone="danger">{message}</Note> : null}
          <Button
            label={t('account.resetSend')}
            disabled={email.trim() === ''}
            loading={send.isPending}
            onPress={() => send.mutate({ email }, { onSuccess: () => setSentTo(email) })}
          />
        </View>
      }
    >
      {leavesGuestData ? <Note tone="warning">{t('account.guestDataStays')}</Note> : null}
      <EmailField
        value={email}
        onChange={change}
        editable={!fixedEmail && !send.isPending}
        error={field === 'email' ? message : null}
      />
    </FormScreen>
  );
}

/** Takes the reset code, which signs in to the account. */
function ResetCodeScreen({ email, onBack }: { email: string; onBack: () => void }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const entry = useCodeEntry({
    check: useConfirmReset(),
    checkWith: (token) => ({ email, token }),
    resend: useSendResetCode(),
    resendWith: { email },
  });

  return (
    <FormScreen
      title={t('account.confirmTitle')}
      subtitle={t('account.resetSent', { email: email.trim(), length: CODE_LENGTH })}
      onBack={onBack}
      footer={
        <View style={{ gap: spacing.lg }}>
          {entry.message ? <Note tone="danger">{entry.message}</Note> : null}
          <Button
            label={t('account.confirm')}
            disabled={entry.code.length < CODE_LENGTH}
            loading={entry.checking}
            onPress={entry.submit}
          />
        </View>
      }
    >
      <CodeEntry entry={entry} />
    </FormScreen>
  );
}
