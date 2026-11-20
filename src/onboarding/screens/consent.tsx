import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, listDivider } from '@/components/ui/card';
import { ConsentBox } from '@/components/ui/consent-box';
import type { IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Screen } from '@/components/ui/screen';
import { StepHeading } from '@/components/ui/step-heading';
import { Text } from '@/components/ui/text';
import { PRIVACY_POLICY_URL, TERMS_URL } from '@/lib/links';
import { useAgreementVersion } from '@/requirements/requirements';
import { TONES, useTheme, type Tone } from '@/theme';

import type { OnboardingAnswers } from '../types';
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
  // The current versions, as the server says them.
  const policyVersion = useAgreementVersion('health_consent');
  const termsVersion = useAgreementVersion('terms');
  const consent = useAgreement('consentedPolicyVersion', policyVersion, answers, answer);
  const terms = useAgreement('acceptedTermsVersion', termsVersion, answers, answer);

  return (
    <Screen
      {...bar}
      footer={
        <Button
          label={t('common.continue')}
          disabled={!consent.checked || !terms.checked}
          onPress={() =>
            next({
              consentedPolicyVersion: policyVersion,
              acceptedTermsVersion: termsVersion,
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
          checked={consent.checked}
          onToggle={consent.toggle}
          readLabel={t('common.readPolicy')}
          onRead={() => void Linking.openURL(PRIVACY_POLICY_URL)}
        />
        <ConsentBox
          title={t('onboarding.consent.terms')}
          checked={terms.checked}
          onToggle={terms.toggle}
          readLabel={t('onboarding.consent.readTerms')}
          onRead={() => void Linking.openURL(TERMS_URL)}
        />
      </View>
    </Screen>
  );
}

/**
 * One box's answer, kept as `key`: ticked only for the current `version` of its text, which
 * Continue saves. Unticking, or a saved answer to an older version, withdraws it.
 */
function useAgreement(
  key: 'consentedPolicyVersion' | 'acceptedTermsVersion',
  version: string,
  answers: OnboardingAnswers,
  answer: (answers: Partial<OnboardingAnswers>) => void,
) {
  const saved = answers[key];
  // The version the box was ticked for: a tick given for another version does not count, as when
  // the server says a newer one while the step shows.
  const [checkedFor, setCheckedFor] = useState(saved === version ? version : null);
  const checked = checkedFor === version;

  // An answer to an older version no longer counts; the box shows it unticked, so clear it too.
  useEffect(() => {
    if (saved !== undefined && saved !== version) {
      answer({ [key]: undefined });
    }
  }, [key, saved, version, answer]);

  const toggle = () => {
    // Unticking withdraws an answer given earlier in this onboarding.
    if (checked) answer({ [key]: undefined });
    setCheckedFor(checked ? null : version);
  };
  return { checked, toggle };
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
