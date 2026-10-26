import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { BrandMark } from '@/brand/brand-mark';
import { Button } from '@/components/ui/button';
import { type IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { LinkPrompt } from '@/components/ui/link-prompt';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useIsAccount } from '@/providers/session-provider';
import { useTheme } from '@/theme';

import { useStep } from '../use-step';

const POINTS: { key: 'plan' | 'logging' | 'records' | 'nutrition'; icon: IconName }[] = [
  { key: 'plan', icon: 'dumbbell' },
  { key: 'logging', icon: 'timer' },
  { key: 'records', icon: 'trophy' },
  { key: 'nutrition', icon: 'meal' },
];

/** Delay between the points appearing, after the logo and the title. */
const POINT_DELAY_MS = 110;
const POINTS_START_MS = 300;

/** The first screen: what Benchbite does, then on to the questions. */
export function WelcomeStep() {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { next } = useStep('welcome');
  const isAccount = useIsAccount();

  return (
    <Screen
      footer={
        <View style={{ gap: spacing.lg }}>
          <Text variant="caption" color="textMuted" align="center">
            {t('onboarding.welcome.free')}
          </Text>
          <Button label={t('onboarding.welcome.start')} onPress={() => next()} />
          {/* An account that logged in before finishing the onboarding has nothing to log in to. */}
          {isAccount ? null : (
            <LinkPrompt
              question={t('account.haveAccount')}
              action={t('account.logIn')}
              onPress={() => router.push('/account/login')}
            />
          )}
        </View>
      }
    >
      <View style={[styles.hero, { gap: spacing.md, marginTop: spacing.xl }]}>
        <Animated.View entering={ZoomIn.duration(400)}>
          <BrandMark size={120} />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(150).duration(400)}>
          <Text variant="title" align="center">
            {t('onboarding.steps.welcome.title')}
          </Text>
          <Text color="textMuted" align="center">
            {t('onboarding.welcome.tagline')}
          </Text>
        </Animated.View>
      </View>
      <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
        {POINTS.map(({ key, icon }, index) => (
          <Animated.View
            key={key}
            entering={FadeInDown.delay(POINTS_START_MS + index * POINT_DELAY_MS).duration(400)}
            style={[styles.row, { gap: spacing.md }]}
          >
            <IconTile name={icon} size={40} />
            <Text variant="bodyStrong" style={styles.flex}>
              {t(`onboarding.welcome.points.${key}`)}
            </Text>
          </Animated.View>
        ))}
        {/* Not there yet, so it is set apart and says so. */}
        <Animated.View
          entering={FadeInDown.delay(POINTS_START_MS + POINTS.length * POINT_DELAY_MS).duration(
            400,
          )}
          style={[
            styles.row,
            styles.soon,
            {
              gap: spacing.md,
              marginTop: spacing.xs,
              padding: spacing.md,
              borderRadius: radii.lg,
              borderColor: colors.primary,
              backgroundColor: colors.surface,
            },
          ]}
        >
          <IconTile name="sparkles" size={40} />
          <View style={styles.flex}>
            <Text variant="captionStrong" color="primaryText">
              {t('onboarding.welcome.soon')}
            </Text>
            <Text variant="bodyStrong">{t('onboarding.welcome.coach')}</Text>
          </View>
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  soon: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  flex: {
    flex: 1,
  },
});
