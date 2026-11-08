import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { BiteSheet } from '@/coach/bite-sheet';
import { Button } from '@/components/ui/button';
import { Card, listDivider } from '@/components/ui/card';
import { FormScreen } from '@/components/ui/form-screen';
import type { IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Note } from '@/components/ui/note';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { useIsAccount, useUserEmail } from '@/providers/session-provider';
import { useTheme, type ColorTokens } from '@/theme';

import {
  accountError,
  CODE_LENGTH,
  errorField,
  startingAgain,
  useAccountError,
  useDeleteAccount,
  useSendDeletionCode,
} from './account';
import { PasswordField } from './account-fields';
import { CodeEntry, useCodeEntry } from './code-entry';

/** What goes, as the user knows it; the database deletes the rest with them. */
const WHAT_GOES: {
  key: 'workouts' | 'meals' | 'progress' | 'bite' | 'notes';
  icon: IconName;
  color: keyof ColorTokens;
  background: keyof ColorTokens;
}[] = [
  { key: 'workouts', icon: 'dumbbell', color: 'lunch', background: 'lunchBackground' },
  { key: 'meals', icon: 'meal', color: 'breakfast', background: 'breakfastBackground' },
  { key: 'progress', icon: 'chart', color: 'water', background: 'waterBackground' },
  { key: 'bite', icon: 'chat', color: 'dinner', background: 'dinnerBackground' },
  { key: 'notes', icon: 'notebook', color: 'snack', background: 'snackBackground' },
];

/**
 * Says what deleting takes, with keeping it as the main button; deleting asks once more in a sheet.
 * A guest deletes from the sheet. An account is sent a code there, and deletes with it, or with its
 * password, on a screen of its own (ADR 0095). Once deleted the app starts over as a new guest,
 * which leaves this screen by itself.
 */
export function DeleteAccountScreen() {
  const isAccount = useIsAccount();
  const email = useUserEmail() ?? '';
  const [proof, setProof] = useState<'code' | 'password' | null>(null);

  if (isAccount && proof) {
    // The code screen stays while the password is shown, so that coming back keeps the code typed
    // and the wait for a new one.
    return (
      <>
        <View style={[styles.flex, proof !== 'code' && styles.hidden]}>
          <DeletionCodeScreen
            email={email}
            onBack={() => setProof(null)}
            onUsePassword={() => setProof('password')}
          />
        </View>
        {proof === 'password' ? (
          <DeletionPasswordScreen
            onBack={() => setProof(null)}
            onUseCode={() => setProof('code')}
          />
        ) : null}
      </>
    );
  }
  return <WhatGoesScreen isAccount={isAccount} email={email} onCodeSent={() => setProof('code')} />;
}

type WhatGoesScreenProps = {
  isAccount: boolean;
  email: string;
  onCodeSent: () => void;
};

/** What goes, and the sheet that asks once more. */
function WhatGoesScreen({ isAccount, email, onCodeSent }: WhatGoesScreenProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const deleteAccount = useDeleteAccount();
  const sendCode = useSendDeletionCode();
  const { message } = useAccountError(sendCode.error ?? deleteAccount.error);
  const [asking, setAsking] = useState(false);
  const pending = deleteAccount.isPending || sendCode.isPending;

  return (
    <Screen
      onBack={() => router.back()}
      footer={
        <View style={{ gap: spacing.md }}>
          {message ? (
            <Text variant="caption" color="danger" align="center" accessibilityLiveRegion="polite">
              {message}
            </Text>
          ) : null}
          <Button
            label={t(isAccount ? 'account.delete.keep' : 'account.delete.keepGuest')}
            onPress={() => router.back()}
          />
          <TextLink
            label={t(isAccount ? 'account.delete.delete' : 'account.delete.deleteGuest')}
            tone="danger"
            size="regular"
            onPress={() => {
              sendCode.reset();
              deleteAccount.reset();
              setAsking(true);
            }}
          />
        </View>
      }
    >
      <View style={{ gap: spacing.sm }}>
        <Text variant="title" accessibilityRole="header">
          {t(isAccount ? 'account.delete.title' : 'account.delete.titleGuest')}
        </Text>
        <Text color="textMuted">{t('account.delete.body')}</Text>
      </View>
      <Card list style={{ marginTop: spacing.xl }}>
        {WHAT_GOES.map(({ key, icon, color, background }, index) => (
          <View
            key={key}
            style={[
              styles.row,
              { gap: spacing.md, paddingVertical: spacing.sm },
              listDivider(index === 0, colors.border),
            ]}
          >
            <IconTile name={icon} size={36} color={color} background={background} />
            <Text variant="label" style={styles.flex}>
              {t(`account.delete.${key}`)}
            </Text>
          </View>
        ))}
      </Card>
      {asking ? (
        <BiteSheet
          title={t('account.delete.sheetTitle')}
          body={
            isAccount ? t('account.delete.sheetCodeBody', { email }) : t('account.delete.sheetBody')
          }
          expression="sad"
          // It cannot be called back while it runs, so the sheet stays until it is decided.
          onClose={() => {
            if (!pending) setAsking(false);
          }}
        >
          {isAccount ? (
            <Button
              label={t('account.delete.sendCode')}
              variant="danger"
              loading={pending}
              onPress={() =>
                sendCode.mutate(undefined, {
                  onSuccess: onCodeSent,
                  // A code sent a moment ago still works, as when coming back to send one.
                  onError: (error) =>
                    accountError(error) === 'codeWait' ? onCodeSent() : setAsking(false),
                })
              }
            />
          ) : (
            <Button
              label={t('account.delete.confirm')}
              variant="danger"
              loading={pending}
              onPress={() => deleteAccount.mutate(undefined, { onError: () => setAsking(false) })}
            />
          )}
          <Button
            label={t('account.delete.notNow')}
            variant="secondary"
            disabled={pending}
            onPress={() => setAsking(false)}
          />
        </BiteSheet>
      ) : null}
    </Screen>
  );
}

type DeletionCodeScreenProps = {
  email: string;
  onBack: () => void;
  onUsePassword: () => void;
};

/**
 * Takes the code sent to the account's address. Unlike the other codes it waits for the button, so
 * that a code typed by mistake, or suggested by the keyboard, deletes nothing.
 */
function DeletionCodeScreen({ email, onBack, onUsePassword }: DeletionCodeScreenProps) {
  const { t } = useTranslation();
  const entry = useCodeEntry({
    check: useDeleteAccount(),
    checkWith: (code) => ({ code }),
    resend: useSendDeletionCode(),
    resendWith: undefined,
    submitWhenFull: false,
  });

  return (
    <FormScreen
      title={t('account.confirmTitle')}
      subtitle={t('account.delete.codeSubtitle', { email, length: CODE_LENGTH })}
      onBack={onBack}
      footer={
        <DeleteFooter
          message={entry.message}
          disabled={!entry.full}
          deleting={entry.checking}
          onDelete={entry.submit}
        />
      }
    >
      <CodeEntry entry={entry}>
        <TextLink
          label={t('account.delete.usePassword')}
          align="start"
          size="regular"
          onPress={onUsePassword}
        />
      </CodeEntry>
    </FormScreen>
  );
}

/** Takes the account's password, for an address that can no longer be opened. */
function DeletionPasswordScreen({
  onBack,
  onUseCode,
}: {
  onBack: () => void;
  onUseCode: () => void;
}) {
  const { t } = useTranslation();
  const deleteAccount = useDeleteAccount();
  const [password, setPassword] = useState('');
  const { reason, message } = useAccountError(deleteAccount.error);
  const field = reason ? errorField(reason) : null;

  return (
    <FormScreen
      title={t('account.delete.passwordTitle')}
      subtitle={t('account.delete.passwordSubtitle')}
      onBack={onBack}
      footer={
        <DeleteFooter
          message={field === 'password' ? null : message}
          disabled={password === ''}
          deleting={deleteAccount.isPending}
          onDelete={() => deleteAccount.mutate({ password })}
        />
      }
    >
      <View>
        <PasswordField
          value={password}
          onChange={startingAgain(deleteAccount)(setPassword)}
          editable={!deleteAccount.isPending}
          error={field === 'password' ? message : null}
        />
        <TextLink
          label={t('account.delete.useCode')}
          align="start"
          size="regular"
          onPress={onUseCode}
        />
      </View>
    </FormScreen>
  );
}

type DeleteFooterProps = {
  message: string | null;
  disabled: boolean;
  deleting: boolean;
  onDelete: () => void;
};

/** Why the last try failed, or that nothing is deleted yet, above the button that deletes. */
function DeleteFooter({ message, disabled, deleting, onDelete }: DeleteFooterProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.lg }}>
      {message ? (
        <Note tone="danger">{message}</Note>
      ) : (
        <Text variant="caption" color="textMuted" align="center">
          {t('account.delete.nothingYet')}
        </Text>
      )}
      <Button
        label={t('account.delete.confirm')}
        variant="danger"
        disabled={disabled}
        loading={deleting}
        onPress={onDelete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
  },
  flex: {
    flex: 1,
  },
  hidden: {
    display: 'none',
  },
});
