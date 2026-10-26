import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ChoiceCard } from '@/components/ui/choice-card';
import type { IconName } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Constants, type Database } from '@/lib/database.types';
import { useTheme } from '@/theme';

import { useStep } from '../use-step';

const SEX_ICONS: Record<Database['public']['Enums']['sex'], IconName> = {
  female: 'woman',
  male: 'man',
  unspecified: 'notSaid',
};

/**
 * Sex, which the calorie calculation needs, with the reason why; "prefer not to say" uses an
 * average.
 */
export function SexStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { answers, progress, back, choose } = useStep('sex');

  return (
    <Screen progress={progress} onBack={back}>
      <View style={{ gap: spacing.xs }}>
        <Text variant="title" accessibilityRole="header">
          {t('onboarding.steps.sex.title')}
        </Text>
        <Text color="textMuted">{t('onboarding.sex.intro')}</Text>
      </View>
      {Constants.public.Enums.sex.map((sex) => (
        <ChoiceCard
          key={sex}
          icon={SEX_ICONS[sex]}
          title={t(`onboarding.options.sex.${sex}`)}
          description={sex === 'unspecified' ? t('onboarding.sex.unspecified') : undefined}
          selected={answers.sex === sex}
          onPress={() => choose({ sex })}
        />
      ))}
    </Screen>
  );
}
