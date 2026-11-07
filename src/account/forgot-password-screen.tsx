import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { FormScreen } from '@/components/ui/form-screen';
import { Note } from '@/components/ui/note';
import { useTheme } from '@/theme';

import {
  accountError,
  CODE_LENGTH,
  errorField,
  useAccountError,
  useConfirmReset,
  useSendResetCode,
} from './account';
import { EmailField } from './account-fields';
import { CodeEntry, useResendWait } from './code-entry';

type ForgotPasswordScreenProps = {
  /** What the log-in form held, to start from. */
  email: string;
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

  const change = (value: string) => {
    setEmail(value);
    if (!send.isPending) {
      send.reset();
    }
  };

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
        editable={!send.isPending}
        error={field === 'email' ? message : null}
      />
    </FormScreen>
  );
}

/** Takes the reset code, which signs in to the account. */
function ResetCodeScreen({ email, onBack }: { email: string; onBack: () => void }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const confirm = useConfirmReset();
  const resend = useSendResetCode();
  const wait = useResendWait();
  const [code, setCode] = useState('');
  const { reason, message } = useAccountError(confirm.error ?? resend.error);

  const send = (token: string) =>
    confirm.mutate(
      { email, token },
      {
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

  const sendAgain = () =>
    resend.mutate(
      { email },
      {
        onSuccess: () => {
          setCode('');
          confirm.reset();
          wait.restart();
        },
      },
    );

  return (
    <FormScreen
      title={t('account.confirmTitle')}
      subtitle={t('account.resetSent', { email: email.trim(), length: CODE_LENGTH })}
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
      <CodeEntry
        code={code}
        onChange={change}
        invalid={reason === 'invalidCode'}
        wait={wait}
        onResend={sendAgain}
        resending={resend.isPending}
      />
    </FormScreen>
  );
}
