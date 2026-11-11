import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Tag } from '@/components/ui/tag';

type WatchChipProps = {
  /** The heart rate the watch measures, in beats per minute, or null without a recent one. */
  heartRate: number | null;
};

/** Says the workout runs on the watch too, with the heart rate it measures (ADR 0116). */
export function WatchChip({ heartRate }: WatchChipProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.center}>
      <Tag
        tone="info"
        icon="watch"
        label={
          heartRate === null
            ? t('session.watch.title')
            : t('session.watch.withHeartRate', { bpm: heartRate })
        }
        accessibilityLabel={
          heartRate === null
            ? t('session.watch.label')
            : t('session.watch.labelWithHeartRate', { bpm: heartRate })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // A row, as a tag aligns itself to the start of a column.
  center: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
});
