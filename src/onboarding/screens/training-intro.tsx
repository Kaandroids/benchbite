import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { IconTile } from '@/components/ui/icon-tile';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { useStep } from '../use-step';

/** The turn from body data to training. */
export function TrainingIntroStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { progress, next, back } = useStep('training-intro');

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={<Button label={t('common.continue')} onPress={() => next()} />}
    >
      <View style={[styles.content, { gap: spacing.lg }]}>
        <Animated.View entering={ZoomIn.duration(400)}>
          <IconTile name="dumbbell" size={88} />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(150).duration(400)} style={{ gap: spacing.md }}>
          <Text variant="title" style={styles.centered}>
            {t('onboarding.steps.training-intro.title')}
          </Text>
          <Text color="textMuted" style={styles.centered}>
            {t('onboarding.trainingIntro.body')}
          </Text>
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: {
    textAlign: 'center',
  },
});
