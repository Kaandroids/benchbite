import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

type WatchChipProps = {
  /** The heart rate the watch measures, in beats per minute, or null before it has one. */
  heartRate: number | null;
};

/** Says the workout runs on the watch too, with the heart rate it measures (ADR 0116). */
export function WatchChip({ heartRate }: WatchChipProps) {
  const { t } = useTranslation();
  const { colors, radii } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={
        heartRate === null
          ? t('session.watch.label')
          : t('session.watch.labelWithHeartRate', { bpm: heartRate })
      }
      style={[styles.chip, { backgroundColor: colors.infoBackground, borderRadius: radii.full }]}
    >
      <Icon name="watch" size={16} color="info" />
      <Text variant="captionStrong" style={styles.tabular}>
        {heartRate === null
          ? t('session.watch.title')
          : t('session.watch.withHeartRate', { bpm: heartRate })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingLeft: 8,
    paddingRight: 12,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
