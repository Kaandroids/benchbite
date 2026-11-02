import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { setStatusBarStyle } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BiteAvatar } from '@/coach/bite-avatar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Sparkles } from '@/components/ui/sparkles';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';
import { darkColors } from '@/theme/colors';

type SpecialOfferScreenProps = {
  /** How much less than the usual price, in whole percent. */
  percent: number;
  /** The usual yearly price and the offer's, each formatted in the user's currency. */
  usualPrice: string;
  price: string;
  /** When the offer ends. */
  endsAt: Date;
  /** What the user made while on premium, kept for them. */
  waiting: { workouts: number; alternatives: number; chats: number };
  onClaim: () => void;
  onClose: () => void;
};

/**
 * An offer of premium for less (#411), such as for coming back after it ended: Bite on top, the
 * first year's price and the button in the middle, and what is waiting for the user at the
 * bottom, with the time left. Always dark, as it stands apart from the app's own screens.
 */
export function SpecialOfferScreen({
  percent,
  usualPrice,
  price,
  endsAt,
  waiting,
  onClaim,
  onClose,
}: SpecialOfferScreenProps) {
  const { t, i18n } = useTranslation();
  const { radii, spacing } = useTheme();
  // Always dark, whatever the theme, as the offer stands apart from the app's own screens.
  const dark = darkColors;
  const left = useTimeLeft(endsAt);
  // Light on the dark screen while it shows, and back to the theme's when another one covers it.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('auto');
    }, []),
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: dark.background }]}>
      <View style={[styles.row, { paddingHorizontal: spacing.lg, minHeight: 52 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          hitSlop={8}
          style={[styles.close, { backgroundColor: dark.track }]}
        >
          <Icon name="close" size={18} fixedColor={dark.text} />
        </Pressable>
        <View style={styles.flex} />
        <View
          style={[
            styles.row,
            styles.pill,
            { backgroundColor: dark.lunchBackground, paddingHorizontal: spacing.md, gap: 6 },
          ]}
        >
          <Icon name="timer" size={14} fixedColor={dark.primary} />
          <Text variant="captionStrong" style={[styles.digits, { color: dark.primary }]}>
            {t('premium.offer.endsIn', { time: left })}
          </Text>
        </View>
      </View>

      <View style={[styles.body, { padding: spacing.xl, paddingTop: spacing.md }]}>
        <View style={[styles.center, { gap: spacing.md }]}>
          <View>
            <Sparkles size={190}>
              <BiteAvatar size={132} expression="happy" />
            </Sparkles>
            <View
              style={[
                styles.stamp,
                { backgroundColor: dark.primaryButton, borderRadius: radii.md },
              ]}
            >
              <Text variant="headline" style={{ color: dark.onPrimary }}>
                −{percent}%
              </Text>
            </View>
          </View>
          <View style={[styles.center, { gap: spacing.xs }]}>
            <Text variant="captionStrong" style={{ color: dark.primary }}>
              {t('premium.offer.kicker').toLocaleUpperCase(i18n.language)}
            </Text>
            <Text variant="title" style={[styles.centerText, { color: dark.text }]}>
              {t('premium.offer.title')}
            </Text>
          </View>
        </View>

        {/* What space is left goes in equal parts above the offer and below what is waiting. */}
        <View style={styles.flex} />

        <View style={{ gap: spacing.md }}>
          <View
            style={[
              styles.row,
              styles.card,
              {
                gap: spacing.md,
                padding: spacing.md,
                backgroundColor: dark.surface,
                borderColor: dark.primary,
                borderWidth: 2,
              },
            ]}
          >
            <View style={styles.flex}>
              <Text variant="label" style={{ color: dark.text }}>
                {t('premium.offer.firstYear')}
              </Text>
              <Text variant="caption" style={{ color: dark.textMuted }}>
                {t('premium.offer.then', { price: usualPrice })}
              </Text>
            </View>
            <View style={styles.end}>
              <Text
                variant="bodyStrong"
                style={[styles.struck, { color: dark.textMuted }]}
                accessibilityLabel={t('premium.offer.usual', { price: usualPrice })}
              >
                {usualPrice}
              </Text>
              <Text variant="title" style={{ color: dark.text }}>
                {price}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.card,
              { padding: spacing.md, gap: spacing.md, backgroundColor: dark.surface },
            ]}
          >
            <Text variant="captionStrong" style={[styles.centerText, { color: dark.textMuted }]}>
              {t('premium.offer.text')}
            </Text>
            <View style={[styles.row, { gap: spacing.sm }]}>
              {(
                [
                  ['dumbbell', 'workouts', waiting.workouts, 'breakfast'],
                  ['layers', 'alternatives', waiting.alternatives, 'snack'],
                  ['chat', 'chats', waiting.chats, 'info'],
                ] as const
              ).map(([icon, kind, count, tint]) => (
                <View key={kind} style={[styles.stat, { gap: spacing.xs }]}>
                  <View
                    style={[
                      styles.tile,
                      {
                        backgroundColor: dark[`${tint}Background`],
                      },
                    ]}
                  >
                    <Icon name={icon} size={20} fixedColor={dark[tint]} />
                  </View>
                  <Text variant="headline" style={{ color: dark.text }}>
                    {count}
                  </Text>
                  <Text variant="caption" style={[styles.centerText, { color: dark.textMuted }]}>
                    {t(`premium.offer.${kind}`, { count })}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.flex} />
      </View>

      <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.md, gap: spacing.sm }}>
        <Button label={t('premium.offer.claim', { percent })} onPress={onClaim} />
        <Text variant="caption" style={[styles.centerText, { color: dark.textMuted }]}>
          {t('premium.offer.legal')}
        </Text>
      </View>
    </SafeAreaView>
  );
}

/** The time left until `endsAt`, as hours, minutes and seconds, counting down each second. */
function useTimeLeft(endsAt: Date) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((endsAt.getTime() - now) / 1000));
  const two = (value: number) => String(value).padStart(2, '0');
  return `${two(Math.floor(seconds / 3600))}:${two(Math.floor((seconds % 3600) / 60))}:${two(seconds % 60)}`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    borderRadius: 999,
    paddingVertical: 6,
  },
  digits: {
    fontVariant: ['tabular-nums'],
  },
  body: {
    flex: 1,
  },
  card: {
    borderRadius: 20,
  },
  end: {
    alignItems: 'flex-end',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stamp: {
    position: 'absolute',
    right: -14,
    top: 108,
    paddingHorizontal: 10,
    paddingVertical: 4,
    transform: [{ rotate: '-12deg' }],
  },
  center: {
    alignItems: 'center',
  },
  centerText: {
    textAlign: 'center',
  },
  struck: {
    textDecorationLine: 'line-through',
  },
});
