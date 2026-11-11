import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { IconTile } from '@/components/ui/icon-tile';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { setStartOnWatch, START_ON_WATCH_CHOICES, useStartOnWatch } from './start-on-watch';

/** The watch in the settings (ADR 0115): that Benchbite is on it, and whether workouts start on it. */
export function WatchSection() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const choice = useStartOnWatch();
  return (
    <>
      <Card style={[styles.row, { gap: spacing.md }]}>
        <IconTile name="watch" size={40} />
        <View style={styles.flex}>
          <Text variant="label">{t('watch.settings.name')}</Text>
          <Text variant="caption" color="success">
            {t('watch.settings.installed')}
          </Text>
        </View>
      </Card>
      <Text variant="label">{t('watch.settings.start')}</Text>
      <SegmentedControl
        accessibilityLabel={t('watch.settings.start')}
        options={START_ON_WATCH_CHOICES.map((value) => ({
          value,
          label: t(`watch.settings.choices.${value}`),
        }))}
        value={choice}
        onChange={setStartOnWatch}
      />
      <Text variant="caption" color="textMuted">
        {t(`watch.settings.notes.${choice}`)}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
});
