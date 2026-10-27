import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { FieldLabel, useFieldStyle } from '@/components/ui/field';
import { FormError } from '@/components/ui/form-error';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { MAX_PASSWORD_LENGTH } from './passwords';

type FieldProps = {
  value: string;
  onChange: (value: string) => void;
  /** Shown under the field, which turns red. */
  error?: string | null;
  /** A link after the error, such as one to log in instead. */
  errorAction?: ReactNode;
  /** False while what was typed is being sent. */
  editable?: boolean;
};

/** The email address of an account. */
export function EmailField({ value, onChange, error, errorAction, editable = true }: FieldProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const field = useFieldStyle();
  return (
    <View style={styles.field}>
      <FieldLabel text={t('account.email')} />
      <TextInput
        accessibilityLabel={t('account.email')}
        value={value}
        onChangeText={onChange}
        editable={editable}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="username"
        placeholder={t('account.emailPlaceholder')}
        placeholderTextColor={colors.placeholder}
        style={[field, error ? { borderColor: colors.danger } : null]}
      />
      {error ? <FormError action={errorAction}>{error}</FormError> : null}
    </View>
  );
}

/** A password, hidden until shown. A new one is offered to the password manager as such. */
export function PasswordField({
  value,
  onChange,
  error,
  hint,
  isNew = false,
  editable = true,
}: FieldProps & { hint?: string; isNew?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const field = useFieldStyle();
  const [shown, setShown] = useState(false);
  return (
    <View style={styles.field}>
      <FieldLabel text={t('account.password')} />
      <View>
        <TextInput
          accessibilityLabel={t('account.password')}
          value={value}
          onChangeText={onChange}
          editable={editable}
          secureTextEntry={!shown}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={isNew ? 'new-password' : 'current-password'}
          textContentType={isNew ? 'newPassword' : 'password'}
          maxLength={MAX_PASSWORD_LENGTH}
          style={[field, styles.password, error ? { borderColor: colors.danger } : null]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={shown ? t('account.hidePassword') : t('account.showPassword')}
          onPress={() => setShown((current) => !current)}
          style={styles.eye}
        >
          <Icon name={shown ? 'eyeOff' : 'eye'} size={22} color="textMuted" />
        </Pressable>
      </View>
      {error ? (
        <FormError>{error}</FormError>
      ) : hint ? (
        <Text variant="caption" color="textMuted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 8,
  },
  password: {
    paddingRight: 52,
  },
  eye: {
    position: 'absolute',
    right: 4,
    top: 4,
    bottom: 4,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
});
