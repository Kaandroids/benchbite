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
import { useNow } from '@/lib/use-now';
import { ThemeScheme, useTheme } from '@/theme';

import { UsageStats } from './usage-stats';

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
 * An offer of premium for less (#411), such as for coming back after it ended: Bite with the
 * discount, the first year's price, what is waiting for the user, and the time left. Always dark,
 * as it stands apart from the app's own screens; once the time is up, it can no longer be claimed.
 */
export function SpecialOfferScreen(props: SpecialOfferScreenProps) {
  return (
    <ThemeScheme scheme="dark">
      <Offer {...props} />
    </ThemeScheme>
  );
}

function Offer({
  percent,
  usualPrice,
  price,
  endsAt,
  waiting,
  onClaim,
  onClose,
}: SpecialOfferScreenProps) {
  const { t, i18n } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const [expired, setExpired] = useState(() => endsAt.getTime() <= Date.now());
  // Light on the dark screen while it shows, and back to the theme's when another one covers it.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('auto');
    }, []),
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.row, { paddingHorizontal: spacing.lg, minHeight: 52 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          hitSlop={8}
          style={[styles.close, { backgroundColor: colors.track }]}
        >
          <Icon name="close" size={18} />
        </Pressable>
        <View style={styles.flex} />
        <Countdown endsAt={endsAt} expired={expired} onExpire={() => setExpired(true)} />
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
                { backgroundColor: colors.primaryButton, borderRadius: radii.md },
              ]}
            >
              <Text variant="headline" color="onPrimary">
                −{percent}%
              </Text>
            </View>
          </View>
          <View style={[styles.center, { gap: spacing.xs }]}>
            <Text variant="captionStrong" color="primaryText">
              {t('premium.offer.kicker').toLocaleUpperCase(i18n.language)}
            </Text>
            <Text variant="title" style={styles.centerText}>
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
              styles.offer,
              {
                gap: spacing.md,
                padding: spacing.md,
                backgroundColor: colors.surface,
                borderColor: colors.primary,
              },
            ]}
          >
            <View style={styles.flex}>
              <Text variant="label">{t('premium.offer.firstYear')}</Text>
              <Text variant="caption" color="textMuted">
                {t('premium.offer.then', { price: usualPrice })}
              </Text>
            </View>
            <View style={styles.end}>
              <Text
                variant="bodyStrong"
                color="textMuted"
                style={styles.struck}
                accessibilityLabel={t('premium.offer.usual', { price: usualPrice })}
              >
                {usualPrice}
              </Text>
              <Text variant="title">{price}</Text>
            </View>
          </View>

          <View
            style={[
              styles.card,
              { padding: spacing.md, gap: spacing.md, backgroundColor: colors.surface },
            ]}
          >
            <Text variant="captionStrong" color="textMuted" style={styles.centerText}>
              {t('premium.offer.text')}
            </Text>
            <UsageStats
              stats={[
                {
                  icon: 'dumbbell',
                  count: waiting.workouts,
                  label: t('premium.offer.workouts', { count: waiting.workouts }),
                  color: 'breakfast',
                  background: 'breakfastBackground',
                },
                {
                  icon: 'layers',
                  count: waiting.alternatives,
                  label: t('premium.offer.alternatives', { count: waiting.alternatives }),
                  color: 'snack',
                  background: 'snackBackground',
                },
                {
                  icon: 'chat',
                  count: waiting.chats,
                  label: t('premium.offer.chats', { count: waiting.chats }),
                  color: 'info',
                  background: 'infoBackground',
                },
              ]}
            />
          </View>
        </View>

        <View style={styles.flex} />
      </View>

      <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.md, gap: spacing.sm }}>
        <Button
          label={t(expired ? 'premium.offer.ended' : 'premium.offer.claim', { percent })}
          disabled={expired}
          onPress={onClaim}
        />
        <Text variant="caption" color="textMuted" style={styles.centerText}>
          {t('premium.offer.legal')}
        </Text>
      </View>
    </SafeAreaView>
  );
}

type CountdownProps = {
  endsAt: Date;
  /** Whether the time is up, after which it stops. */
  expired: boolean;
  /** Called when the time is up. */
  onExpire: () => void;
};

/**
 * The time left until `endsAt`, as hours, minutes and seconds, in a tag. It ticks on its own, so
 * that the rest of the screen does not draw again each second, and stops at the end.
 */
function Countdown({ endsAt, expired, onExpire }: CountdownProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const now = useNow(!expired);
  const seconds = Math.max(0, Math.floor((endsAt.getTime() - now) / 1000));
  useEffect(() => {
    if (!expired && seconds === 0) {
      onExpire();
    }
  }, [expired, seconds, onExpire]);
  const two = (value: number) => String(value).padStart(2, '0');
  const time = `${two(Math.floor(seconds / 3600))}:${two(Math.floor((seconds % 3600) / 60))}:${two(seconds % 60)}`;

  return (
    <View
      style={[
        styles.row,
        styles.pill,
        { backgroundColor: colors.lunchBackground, paddingHorizontal: spacing.md, gap: 6 },
      ]}
    >
      <Icon name="timer" size={14} color="primary" />
      <Text variant="captionStrong" color="primaryText" style={styles.digits}>
        {t('premium.offer.endsIn', { time })}
      </Text>
    </View>
  );
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
  offer: {
    borderWidth: 2,
  },
  end: {
    alignItems: 'flex-end',
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
