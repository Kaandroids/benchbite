import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { useStep } from '../use-step';

const POINTS: { key: 'plan' | 'nutrition' | 'together'; icon: IconName }[] = [
  { key: 'plan', icon: 'dumbbell' },
  { key: 'nutrition', icon: 'meal' },
  { key: 'together', icon: 'chart' },
];

/** The first screen: what Benchbite does, then on to the questions. */
export function WelcomeStep() {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { next } = useStep('welcome');

  return (
    <Screen footer={<Button label={t('onboarding.welcome.start')} onPress={() => next()} />}>
      <View style={[styles.hero, { gap: spacing.md, marginTop: spacing.xxl }]}>
        {/* A placeholder until the logo exists (#45). */}
        <Animated.View
          entering={ZoomIn.duration(400)}
          style={[styles.logo, { backgroundColor: colors.primary, borderRadius: radii.xl }]}
        >
          <Icon name="dumbbell" size={44} color="onPrimary" />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(150).duration(400)}>
          <Text variant="title" style={styles.centered}>
            {t('onboarding.steps.welcome.title')}
          </Text>
          <Text color="textMuted" style={styles.centered}>
            {t('onboarding.welcome.tagline')}
          </Text>
        </Animated.View>
      </View>
      <View style={{ gap: spacing.lg, marginTop: spacing.xl }}>
        {POINTS.map(({ key, icon }, index) => (
          <Animated.View
            key={key}
            entering={FadeInDown.delay(350 + index * 120).duration(400)}
            style={[styles.point, { gap: spacing.md }]}
          >
            <IconTile name={icon} />
            <Text variant="bodyStrong" style={styles.pointText}>
              {t(`onboarding.welcome.points.${key}`)}
            </Text>
          </Animated.View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
  },
  logo: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: {
    textAlign: 'center',
  },
  point: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pointText: {
    flex: 1,
  },
});
