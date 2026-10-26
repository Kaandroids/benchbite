import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';

import { loadThemeChoice, saveThemeChoice, type ThemeChoice } from './preferences';

const CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

/** Light, dark, or the phone's setting. */
export function AppearanceSection() {
  const { t } = useTranslation();
  const [choice, setChoice] = useState(loadThemeChoice);
  return (
    <>
      <SegmentedControl
        accessibilityLabel={t('settings.appearance')}
        options={CHOICES.map((value) => ({ value, label: t(`settings.themes.${value}`) }))}
        value={choice}
        onChange={(value) => {
          setChoice(value);
          saveThemeChoice(value);
        }}
      />
      <Text variant="caption" color="textMuted">
        {t('settings.themeNote')}
      </Text>
    </>
  );
}
