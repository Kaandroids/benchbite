import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import { FieldLabel, useFieldStyle } from '@/components/ui/field';
import { useTheme } from '@/theme';

import { MAX_DISPLAY_NAME_LENGTH } from './display-name';

type NameFieldProps = {
  value: string;
  onChange: (value: string) => void;
  /** Called with the keyboard's done key. */
  onSubmit: () => void;
  /** False while the name is being saved. */
  editable?: boolean;
  /** Shows the field's own label; leave it out where a heading already names the field. */
  showLabel?: boolean;
};

/** What the user wants to be called: a first name or a nickname. */
export function NameField({
  value,
  onChange,
  onSubmit,
  editable = true,
  showLabel = true,
}: NameFieldProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const field = useFieldStyle();
  return (
    <View style={{ gap: spacing.sm }}>
      {showLabel ? <FieldLabel text={t('profile.name')} /> : null}
      <TextInput
        accessibilityLabel={t('profile.name')}
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        editable={editable}
        maxLength={MAX_DISPLAY_NAME_LENGTH}
        autoCapitalize="words"
        autoCorrect={false}
        autoComplete="given-name"
        textContentType="givenName"
        returnKeyType="done"
        placeholder={t('profile.namePlaceholder')}
        placeholderTextColor={colors.placeholder}
        style={[field, styles.input]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    fontSize: 18,
  },
});
