import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { deviceLanguage, LANGUAGE_NAMES, SUPPORTED_LANGUAGES, type Language } from '@/i18n';
import { useTheme } from '@/theme';

import { setLanguageChoice, useLanguageChoice, type LanguageChoice } from './preferences';
import { SettingRow } from './setting-row';

/** The app's language in a row, chosen in a sheet: one of its languages, or the phone's. */
export function LanguageSection() {
  const { t, i18n } = useTranslation();
  const choice = useLanguageChoice();
  const [open, setOpen] = useState(false);
  const current = LANGUAGE_NAMES[i18n.language as Language] ?? i18n.language;

  const choose = (value: LanguageChoice) => {
    setOpen(false);
    setLanguageChoice(value);
  };

  return (
    <>
      <SettingRow
        label={t('settings.language')}
        value={current}
        hint={t('settings.languageHint')}
        onPress={() => setOpen(true)}
      />
      {open ? (
        <Sheet onClose={() => setOpen(false)}>
          <Text variant="headline" accessibilityRole="header">
            {t('settings.language')}
          </Text>
          <Card list>
            <Option
              label={t('settings.phoneLanguage')}
              detail={t('settings.phoneLanguageNow', {
                language: LANGUAGE_NAMES[deviceLanguage()],
              })}
              selected={choice === 'system'}
              first
              onPress={() => choose('system')}
            />
            {SUPPORTED_LANGUAGES.map((language) => (
              <Option
                key={language}
                label={LANGUAGE_NAMES[language]}
                lang={language}
                selected={choice === language}
                onPress={() => choose(language)}
              />
            ))}
          </Card>
        </Sheet>
      ) : null}
    </>
  );
}

function Option({
  label,
  detail,
  lang,
  selected,
  first = false,
  onPress,
}: {
  label: string;
  detail?: string;
  /** The language the label is in, for screen readers. */
  lang?: Language;
  selected: boolean;
  first?: boolean;
  onPress: () => void;
}) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLanguage={lang}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        styles.option,
        {
          gap: spacing.md,
          paddingVertical: spacing.sm,
          borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      <View style={styles.flex}>
        <Text variant={selected ? 'label' : 'bodyStrong'}>{label}</Text>
        {detail ? (
          <Text variant="caption" color="textMuted">
            {detail}
          </Text>
        ) : null}
      </View>
      {selected ? <Icon name="check" size={22} color="primary" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  option: {
    minHeight: 52,
  },
  flex: {
    flex: 1,
  },
});
