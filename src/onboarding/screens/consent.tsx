import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ChoiceCard } from '@/components/ui/choice-card';
import type { IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { PRIVACY_POLICY_URL, PRIVACY_POLICY_VERSION } from '../consent';
import { useStep } from '../use-step';

const POINTS: { key: 'what' | 'why' | 'control'; icon: IconName }[] = [
  { key: 'what', icon: 'chart' },
  { key: 'why', icon: 'target' },
  { key: 'control', icon: 'shield' },
];

/**
 * Explicit consent to process health data (GDPR Article 9), before any body data is asked. The
 * box starts unticked, and declining explains why the onboarding cannot go on without it.
 */
export function ConsentStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { answers, progress, answer, next, back } = useStep('consent');
  const [agreed, setAgreed] = useState(answers.consentedPolicyVersion === PRIVACY_POLICY_VERSION);
  const [declined, setDeclined] = useState(false);

  if (declined) {
    return (
      <Screen
        progress={progress}
        onBack={back}
        footer={
          <Button
            label={t('onboarding.consent.declined.review')}
            onPress={() => setDeclined(false)}
          />
        }
      >
        <View style={[styles.centeredContent, { gap: spacing.lg }]}>
          <IconTile name="shield" size={88} />
          <Text variant="title" align="center">
            {t('onboarding.consent.declined.title')}
          </Text>
          <Text color="textMuted" align="center">
            {t('onboarding.consent.declined.body')}
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button
            label={t('common.continue')}
            disabled={!agreed}
            onPress={() => next({ consentedPolicyVersion: PRIVACY_POLICY_VERSION })}
          />
          <Button
            variant="ghost"
            label={t('onboarding.consent.decline')}
            onPress={() => {
              // Withdraws a consent given earlier in this onboarding.
              setAgreed(false);
              answer({ consentedPolicyVersion: undefined });
              setDeclined(true);
            }}
          />
        </View>
      }
    >
      <Text variant="title">{t('onboarding.steps.consent.title')}</Text>
      <Text color="textMuted">{t('onboarding.consent.intro')}</Text>
      <View style={{ gap: spacing.lg, marginVertical: spacing.sm }}>
        {POINTS.map(({ key, icon }) => (
          <View key={key} style={[styles.point, { gap: spacing.md }]}>
            <IconTile name={icon} />
            <View style={styles.pointText}>
              <Text variant="bodyStrong">{t(`onboarding.consent.${key}.title`)}</Text>
              <Text variant="caption" color="textMuted">
                {t(`onboarding.consent.${key}.body`)}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <ChoiceCard
        type="checkbox"
        title={t('onboarding.consent.agree')}
        selected={agreed}
        onPress={() => setAgreed((value) => !value)}
      />
      <Button
        variant="ghost"
        label={t('onboarding.consent.policy')}
        onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centeredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  point: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pointText: {
    flex: 1,
    gap: 2,
  },
});
