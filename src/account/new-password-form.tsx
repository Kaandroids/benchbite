import { useEffect, useState } from 'react';
import { BackHandler, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { FormScreen } from '@/components/ui/form-screen';
import { Note } from '@/components/ui/note';
import { useTheme } from '@/theme';

import { errorField, startingAgain, useAccountError } from './account';
import { PasswordField } from './account-fields';
import { isPasswordValid } from './passwords';

type NewPasswordFormProps = {
  title: string;
  subtitle: string;
  /** The field's label, when not "Password". */
  label?: string;
  /** What the field starts with. */
  initial?: string;
  saveLabel: string;
  saving: boolean;
  error: unknown;
  reset: () => void;
  onSave: (password: string) => void;
};

/**
 * Asks for the password of an account that is signed in already, when nothing else can go on
 * before it is saved (ADR 0091, ADR 0092). There is no way back, and Android's back button is
 * stopped too, as leaving would leave the account without a password anyone knows.
 */
export function NewPasswordForm({
  title,
  subtitle,
  label,
  initial = '',
  saveLabel,
  saving,
  error,
  reset,
  onSave,
}: NewPasswordFormProps) {
  const { spacing } = useTheme();
  const [password, setPassword] = useState(initial);
  const { reason, message } = useAccountError(error);
  const onField = reason !== null && errorField(reason) === 'password';

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);

  const change = startingAgain({ isPending: saving, reset })(setPassword);

  return (
    <FormScreen
      title={title}
      subtitle={subtitle}
      footer={
        <View style={{ gap: spacing.lg }}>
          {message && !onField ? <Note tone="danger">{message}</Note> : null}
          <Button
            label={saveLabel}
            disabled={!isPasswordValid(password)}
            loading={saving}
            onPress={() => onSave(password)}
          />
        </View>
      }
    >
      <PasswordField
        label={label}
        value={password}
        onChange={change}
        editable={!saving}
        error={onField ? message : null}
        isNew
      />
    </FormScreen>
  );
}
