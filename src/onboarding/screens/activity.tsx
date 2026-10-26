import { useTranslation } from 'react-i18next';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Caption } from '@/components/ui/caption';
import { Card } from '@/components/ui/card';
import { ChoiceCard } from '@/components/ui/choice-card';
import type { IconName } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useNumberFormat } from '@/i18n/units';
import { Constants } from '@/lib/database.types';
import { useTheme } from '@/theme';

import { activityShare } from '../body';
import { StepHeading } from '../step-heading';
import type { OnboardingAnswers } from '../types';
import { useStep } from '../use-step';

type ActivityLevel = NonNullable<OnboardingAnswers['activityLevel']>;

const ICONS: Record<ActivityLevel, IconName> = {
  sedentary: 'chair',
  light: 'person',
  moderate: 'run',
  active: 'hammer',
};
const LEVELS = Constants.public.Enums.activity_level;

/**
 * Daily movement outside workouts, each level with an icon and a meter, and a card on what the
 * chosen one adds to the calories; the training days are added to it in the calculation.
 * Choosing saves the answer, and Continue moves on.
 */
export function ActivityStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { answers, progress, back, answer, next } = useStep('activity');
  const level = answers.activityLevel;

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={<Button label={t('common.continue')} disabled={!level} onPress={() => next()} />}
    >
      <StepHeading
        title={t('onboarding.steps.activity.title')}
        intro={t('onboarding.activity.intro')}
      />
      {LEVELS.map((activityLevel, index) => (
        <ChoiceCard
          key={activityLevel}
          icon={ICONS[activityLevel]}
          title={t(`onboarding.options.activityLevel.${activityLevel}`)}
          description={t(`onboarding.activity.descriptions.${activityLevel}`)}
          level={{ value: index + 1, of: LEVELS.length }}
          selected={level === activityLevel}
          onPress={() => {
            if (level !== activityLevel) answer({ activityLevel });
          }}
          size="compact"
        />
      ))}
      {level ? (
        <Card style={{ gap: spacing.xs, marginTop: spacing.xs }}>
          <Caption>{t('onboarding.activity.calories')}</Caption>
          <CaloriesLine level={level} />
          <Text variant="caption" color="textMuted">
            {t('onboarding.activity.note')}
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}

/** What the level adds to the calories, against mostly sitting; keyed so it fades in anew. */
function CaloriesLine({ level }: { level: ActivityLevel }) {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  const share = activityShare(level);
  return (
    <Animated.View key={level} entering={FadeIn.duration(250)} accessibilityLiveRegion="polite">
      <Text variant="bodyStrong" color={share > 0 ? 'primaryText' : 'text'}>
        {share > 0
          ? t('onboarding.activity.more', {
              percent: format(share, {
                style: 'percent',
                maximumFractionDigits: 0,
              }),
            })
          : t('onboarding.activity.base')}
      </Text>
    </Animated.View>
  );
}
