import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { fonts, useTheme } from '@/theme';
import { minutesAndSeconds } from '@/workouts/format';

type RestBarProps = {
  /** Seconds of rest left, and of the whole rest. */
  left: number;
  total: number;
  onChange: (seconds: number) => void;
  onSkip: () => void;
};

/** The rest between sets, counting down at the bottom of the screen. */
export function RestBar({ left, total, onChange, onSkip }: RestBarProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  // Dark in both themes, so that it stands out from the cards behind it.
  const button = [styles.button, { borderRadius: radii.full, backgroundColor: '#2A2C31' }];
  return (
    <View
      accessibilityRole="timer"
      accessibilityLabel={t('session.restLeft', { time: minutesAndSeconds(left) })}
      style={[
        styles.bar,
        {
          bottom: insets.bottom + spacing.md,
          left: spacing.md,
          right: spacing.md,
          gap: spacing.sm,
          borderRadius: radii.xl,
          paddingLeft: spacing.lg,
        },
      ]}
    >
      <View style={[styles.flex, { gap: 6 }]}>
        <View style={styles.label}>
          <Text variant="caption" style={[styles.bold, styles.muted]}>
            {t('session.rest')}
          </Text>
          <Text variant="headline" style={[styles.bold, styles.light, styles.tabular]}>
            {minutesAndSeconds(left)}
          </Text>
        </View>
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { backgroundColor: colors.primary, width: `${Math.min(100, (left / total) * 100)}%` },
            ]}
          />
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('session.restLess')}
        onPress={() => onChange(-15)}
        style={button}
      >
        <Text variant="caption" style={[styles.bold, styles.light]}>
          −15
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('session.restMore')}
        onPress={() => onChange(15)}
        style={button}
      >
        <Text variant="caption" style={[styles.bold, styles.light]}>
          +15
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={onSkip}
        style={[styles.button, { borderRadius: radii.full, backgroundColor: colors.primaryButton }]}
      >
        <Text variant="caption" color="onPrimary" style={styles.bold}>
          {t('session.skip')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#16171A',
  },
  flex: {
    flex: 1,
  },
  label: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  bold: {
    fontFamily: fonts.extraBold,
  },
  light: {
    color: '#FFFFFF',
  },
  muted: {
    color: '#C9CBD1',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3C42',
    overflow: 'hidden',
  },
  fill: {
    height: 4,
  },
  button: {
    height: 40,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
});
