import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, listDivider } from '@/components/ui/card';
import type { IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Screen } from '@/components/ui/screen';
import { StepHeading } from '@/components/ui/step-heading';
import { Text } from '@/components/ui/text';
import { PRIVACY_POLICY_URL, TERMS_URL } from '@/lib/links';
import { TONES, useTheme, type Tone } from '@/theme';

import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from '../consent';
import { ConsentBox } from '../consent-box';
import { useStep } from '../use-step';

const POINTS: { key: 'what' | 'why' | 'control'; icon: IconName; tone: Tone }[] = [
  { key: 'what', icon: 'chart', tone: 'dinner' },
  { key: 'why', icon: 'target', tone: 'water' },
  { key: 'control', icon: 'shield', tone: 'snack' },
];

/**
 * Explicit consent to process health data (GDPR Article 9), before any body data is asked, and
 * acceptance of the terms of use (ADR 0141), each in a box of its own beside the text it agrees
 * to. The boxes start unticked; leaving one unticked is how to decline, and the intro says the
 * onboarding cannot go on without the consent.
 *
 * Both are saved only by Continue, with the current versions. Unticking, or a saved answer to an
 * older version, clears it at once, so nothing stays saved that its box does not show.
 */
export function ConsentStep() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { answers, answer, next, bar } = useStep('consent');
  const [agreed, setAgreed] = useState(answers.consentedPolicyVersion === PRIVACY_POLICY_VERSION);
  const [accepted, setAccepted] = useState(answers.acceptedTermsVersion === TERMS_VERSION);
  const saved = answers.consentedPolicyVersion;
  const savedTerms = answers.acceptedTermsVersion;

  // An answer to an older version no longer counts; its box shows it unticked, so clear it too.
  useEffect(() => {
    if (saved !== undefined && saved !== PRIVACY_POLICY_VERSION) {
      answer({ consentedPolicyVersion: undefined });
    }
  }, [saved, answer]);
  useEffect(() => {
    if (savedTerms !== undefined && savedTerms !== TERMS_VERSION) {
      answer({ acceptedTermsVersion: undefined });
    }
  }, [savedTerms, answer]);

  return (
    <Screen
      {...bar}
      footer={
        <Button
          label={t('common.continue')}
          disabled={!agreed || !accepted}
          onPress={() =>
            next({
              consentedPolicyVersion: PRIVACY_POLICY_VERSION,
              acceptedTermsVersion: TERMS_VERSION,
            })
          }
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
      {/* A little apart from the points, as the step's answers. */}
      <View style={{ marginTop: spacing.md, gap: spacing.md }}>
        <ConsentBox
          title={t('onboarding.consent.agree')}
          checked={agreed}
          onToggle={() => {
            // Unticking withdraws a consent given earlier in this onboarding.
            if (agreed) answer({ consentedPolicyVersion: undefined });
            setAgreed(!agreed);
          }}
          readLabel={t('onboarding.consent.policy')}
          onRead={() => void Linking.openURL(PRIVACY_POLICY_URL)}
        />
        <ConsentBox
          title={t('onboarding.consent.terms')}
          checked={accepted}
          onToggle={() => {
            if (accepted) answer({ acceptedTermsVersion: undefined });
            setAccepted(!accepted);
          }}
          readLabel={t('onboarding.consent.termsLink')}
          onRead={() => void Linking.openURL(TERMS_URL)}
        />
      </View>
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
