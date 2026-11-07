import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { FormScreen } from '@/components/ui/form-screen';
import { Note } from '@/components/ui/note';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { useTheme } from '@/theme';

import { CODE_LENGTH, useConfirmAccount, useResendCode, type NewAccountKind } from './account';
import { CodeEntry, useCodeEntry } from './code-entry';
import { NewPasswordForm } from './new-password-form';

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
  const entry = useCodeEntry({
    check: confirm,
    checkWith: (token) => ({ email, token, password, kind }),
    onChecked: onConfirmed,
    resend,
    resendWith: { email, kind },
  });

  if (confirm.accepted) {
    // Saving the password failed after the code: the account exists, and the form can do no more.
    return (
      <NewPasswordForm
        title={t('account.confirmPasswordTitle')}
        subtitle={t('account.confirmPasswordLeft')}
        initial={password}
        saveLabel={t('account.confirm')}
        saving={confirm.isPending}
        error={confirm.error}
        reset={confirm.reset}
        onSave={(newPassword) =>
          confirm.mutate(
            { email, token: entry.code, password: newPassword, kind },
            { onSuccess: onConfirmed },
          )
        }
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
      <CodeEntry entry={entry}>
        <TextLink
          label={t('account.confirmAnotherEmail')}
          align="start"
          size="regular"
          onPress={onBack}
        />
      </CodeEntry>
      {kind === 'guest' ? (
        <Text variant="caption" color="textMuted">
          {t('account.confirmGuestNote')}
        </Text>
      ) : null}
    </FormScreen>
  );
}
