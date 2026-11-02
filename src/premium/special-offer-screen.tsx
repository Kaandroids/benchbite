import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { setStatusBarStyle } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BRAND_ORANGE_DARK } from '@/brand/mark';
import { BiteAvatar } from '@/coach/bite-avatar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Sparkles } from '@/components/ui/sparkles';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

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
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const left = useTimeLeft(endsAt);
  // Light on the dark screen while it shows, and back to the theme's when another one covers it.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('auto');
    }, []),
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.inverseSurface }]}>
      <View style={[styles.top, { paddingHorizontal: spacing.md }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          hitSlop={8}
          style={[styles.close, { backgroundColor: colors.inverseRaised }]}
        >
          <Icon name="close" size={18} color="onInverse" />
        </Pressable>
        <View
          style={[
            styles.pill,
            { backgroundColor: colors.inverseRaised, paddingHorizontal: spacing.md },
          ]}
        >
          <Text variant="captionStrong" color="onInverse" style={styles.digits}>
            {t('premium.offer.endsIn', { time: left })}
          </Text>
        </View>
      </View>

      <View style={[styles.body, { gap: spacing.xl, padding: spacing.xl }]}>
        <View style={[styles.center, { gap: spacing.md }]}>
          <View>
            <Sparkles size={220}>
              <BiteAvatar size={156} expression="happy" />
            </Sparkles>
            <View
              style={[
                styles.stamp,
                { backgroundColor: colors.primaryButton, borderRadius: radii.md },
              ]}
            >
              <Text variant="headline" style={{ color: colors.onPrimary }}>
                −{percent}%
              </Text>
            </View>
          </View>
          <View style={[styles.center, { gap: spacing.xs }]}>
            <Text variant="captionStrong" style={{ color: BRAND_ORANGE_DARK }}>
              {t('premium.offer.kicker').toUpperCase()}
            </Text>
            <Text variant="title" color="onInverse" style={styles.centerText}>
              {t('premium.offer.title')}
            </Text>
          </View>
        </View>

        <View style={[styles.center, { gap: spacing.lg }]}>
          <View style={styles.center}>
            <Text
              variant="headline"
              color="onInverseMuted"
              style={styles.struck}
              accessibilityLabel={t('premium.offer.usual', { price: usualPrice })}
            >
              {usualPrice}
            </Text>
            <Text variant="display" color="onInverse">
              {price}
            </Text>
            <Text variant="label" color="onInverse">
              {t('premium.offer.firstYear')}
            </Text>
            <Text variant="caption" color="onInverseMuted">
              {t('premium.offer.then', { price: usualPrice })}
            </Text>
          </View>
          <View style={[styles.stretch, { gap: spacing.sm }]}>
            <Button label={t('premium.offer.claim', { percent })} onPress={onClaim} />
            <Text variant="caption" color="onInverseMuted" style={styles.centerText}>
              {t('premium.offer.legal')}
            </Text>
          </View>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text variant="caption" color="onInverseMuted" style={styles.centerText}>
            {t('premium.offer.text')}
          </Text>
          <View style={[styles.stats, { gap: spacing.sm }]}>
            {(
              [
                ['workouts', waiting.workouts],
                ['alternatives', waiting.alternatives],
                ['chats', waiting.chats],
              ] as const
            ).map(([kind, count]) => (
              <View
                key={kind}
                style={[
                  styles.stat,
                  {
                    backgroundColor: colors.inverseRaised,
                    borderRadius: radii.md,
                    padding: spacing.sm,
                  },
                ]}
              >
                <Text variant="headline" color="onInverse">
                  {count}
                </Text>
                <Text variant="caption" color="onInverseMuted" style={styles.centerText}>
                  {t(`premium.offer.${kind}`, { count })}
                </Text>
              </View>
            ))}
          </View>
        </View>
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
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    justifyContent: 'space-between',
  },
  stretch: {
    alignSelf: 'stretch',
  },
  stats: {
    flexDirection: 'row',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  stamp: {
    position: 'absolute',
    right: -16,
    top: 124,
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
