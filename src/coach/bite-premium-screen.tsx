import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { LoadState } from '@/components/load-state';
import { Card, listDivider } from '@/components/ui/card';
import type { IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { GetPremiumFooter, PremiumHero, RestoreLink } from '@/premium/get-premium';
import { usePlanSummary } from '@/premium/plan';
import { useTheme, type ColorTokens } from '@/theme';

const BITE_SIZE = 110;

/** What Bite does, each with its icon, in a colour of its own. */
const POINTS: {
  key: 'chat' | 'week' | 'reviews';
  icon: IconName;
  color: keyof ColorTokens;
  background: keyof ColorTokens;
}[] = [
  { key: 'chat', icon: 'chat', color: 'lunch', background: 'lunchBackground' },
  { key: 'week', icon: 'calendar', color: 'dinner', background: 'dinnerBackground' },
  { key: 'reviews', icon: 'chart', color: 'water', background: 'waterBackground' },
];

/**
 * Bite for a user whose plan has no chat and who has no chat to read (#411): what Bite does, and a
 * way to premium.
 */
export function BitePremiumScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const summary = usePlanSummary();
  return (
    <Screen
      closes
      onBack={() => router.back()}
      action={<RestoreLink />}
      footer={summary.data?.plan === 'free' ? <GetPremiumFooter free={summary.data} /> : undefined}
    >
      <PremiumHero
        size={BITE_SIZE}
        title={t('bite.premium.title')}
        subtitle={t('bite.premium.subtitle')}
      />
      <Card list>
        {POINTS.map(({ key, icon, color, background }, index) => (
          <View
            key={key}
            style={[
              styles.point,
              { gap: spacing.md + 2, paddingVertical: spacing.md },
              listDivider(index === 0, colors.border),
            ]}
          >
            <IconTile name={icon} size={40} color={color} background={background} />
            <View style={styles.flex}>
              <Text variant="label">{t(`bite.premium.points.${key}.title`)}</Text>
              <Text variant="caption" color="textMuted">
                {t(`bite.premium.points.${key}.note`)}
              </Text>
            </View>
          </View>
        ))}
      </Card>
      <LoadState queries={[summary]} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  point: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
});
