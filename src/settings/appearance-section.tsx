import { useTranslation } from 'react-i18next';

import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';

import { setThemeChoice, THEME_CHOICES, useThemeChoice } from './preferences';

/** Light, dark, or the phone's setting. */
export function AppearanceSection() {
  const { t } = useTranslation();
  const choice = useThemeChoice();
  return (
    <>
      <SegmentedControl
        accessibilityLabel={t('settings.appearance')}
        options={THEME_CHOICES.map((value) => ({ value, label: t(`settings.themes.${value}`) }))}
        value={choice}
        onChange={setThemeChoice}
      />
      <Text variant="caption" color="textMuted">
        {t('settings.themeNote')}
      </Text>
    </>
  );
}
