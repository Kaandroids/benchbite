import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, listDivider } from '@/components/ui/card';
import { ChoiceCard } from '@/components/ui/choice-card';
import type { IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Screen } from '@/components/ui/screen';
import { StepHeading } from '@/components/ui/step-heading';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { PRIVACY_POLICY_URL } from '@/lib/links';
import { TONES, useTheme, type Tone } from '@/theme';

import { PRIVACY_POLICY_VERSION } from '../consent';
import { useStep } from '../use-step';

const POINTS: { key: 'what' | 'why' | 'control'; icon: IconName; tone: Tone }[] = [
  { key: 'what', icon: 'chart', tone: 'dinner' },
  { key: 'why', icon: 'target', tone: 'water' },
  { key: 'control', icon: 'shield', tone: 'snack' },
];

/**
 * Explicit consent to process health data (GDPR Article 9), before any body data is asked. The
 * box starts unticked; leaving it unticked is how to decline, and the intro says the onboarding
 * cannot go on without it.
 *
 * The consent is saved only by Continue, with the current policy version. Unticking, or a saved
 * consent to an older policy, clears it at once, so no consent stays saved that the box does not
 * show.
 */
export function ConsentStep() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { answers, answer, next, bar } = useStep('consent');
  const [agreed, setAgreed] = useState(answers.consentedPolicyVersion === PRIVACY_POLICY_VERSION);
  const saved = answers.consentedPolicyVersion;

  // A consent to an older policy no longer counts; the box shows it unticked, so clear it too.
  useEffect(() => {
    if (saved !== undefined && saved !== PRIVACY_POLICY_VERSION) {
      answer({ consentedPolicyVersion: undefined });
    }
  }, [saved, answer]);

  return (
    <Screen
      {...bar}
      footer={
        <Button
          label={t('common.continue')}
          disabled={!agreed}
          onPress={() => next({ consentedPolicyVersion: PRIVACY_POLICY_VERSION })}
        />
      }
    >
      <StepHeading
        title={t('onboarding.steps.consent.title')}
        intro={t('onboarding.consent.intro')}
      />
      <Card list>
        {POINTS.map(({ key, icon, tone }, index) => (
          <View
            key={key}
            style={[
              styles.point,
              {
                gap: spacing.md,
                paddingVertical: spacing.md + 2,
                ...listDivider(index === 0, colors.border),
              },
            ]}
          >
            <IconTile name={icon} size={48} {...TONES[tone]} />
            <View style={styles.pointText}>
              <Text variant="label">{t(`onboarding.consent.${key}.title`)}</Text>
              <Text variant="caption" color="textMuted">
                {t(`onboarding.consent.${key}.body`)}
              </Text>
            </View>
          </View>
        ))}
      </Card>
      {/* A little apart from the points, as the step's one answer. */}
      <View style={{ marginTop: spacing.md }}>
        <ChoiceCard
          type="checkbox"
          title={t('onboarding.consent.agree')}
          selected={agreed}
          onPress={() => {
            // Unticking withdraws a consent given earlier in this onboarding.
            if (agreed) answer({ consentedPolicyVersion: undefined });
            setAgreed(!agreed);
          }}
        />
      </View>
      <TextLink
        label={t('onboarding.consent.policy')}
        onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  point: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pointText: {
    flex: 1,
    gap: 2,
  },
});
