import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChoiceCard } from '@/components/ui/choice-card';
import type { IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { MessageView } from '@/components/ui/message-view';
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

/** The space above and below each point, between the theme's medium and large. */
const ROW_PADDING = 20;

/**
 * Explicit consent to process health data (GDPR Article 9), before any body data is asked. The
 * box starts unticked; leaving it unticked is how to decline, and a link explains why the
 * onboarding cannot go on without it.
 */
export function ConsentStep() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { answers, progress, answer, next, back } = useStep('consent');
  const [agreed, setAgreed] = useState(answers.consentedPolicyVersion === PRIVACY_POLICY_VERSION);
  const [explaining, setExplaining] = useState(false);

  if (explaining) {
    return (
      <Screen
        progress={progress}
        onBack={back}
        footer={
          <Button
            label={t('onboarding.consent.needed.back')}
            onPress={() => setExplaining(false)}
          />
        }
      >
        <MessageView
          icon="shield"
          title={t('onboarding.consent.needed.title')}
          message={t('onboarding.consent.needed.body')}
        />
      </Screen>
    );
  }

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={
        <View style={{ gap: spacing.md }}>
          <Button
            label={t('common.continue')}
            disabled={!agreed}
            onPress={() => next({ consentedPolicyVersion: PRIVACY_POLICY_VERSION })}
          />
          {/* Quiet, so it does not compete with Continue: it only explains. */}
          <TextLink
            label={t('onboarding.consent.whyLink')}
            color="textMuted"
            onPress={() => setExplaining(true)}
          />
        </View>
      }
    >
      <View style={{ gap: spacing.xs }}>
        <Text variant="title" accessibilityRole="header">
          {t('onboarding.steps.consent.title')}
        </Text>
        <Text color="textMuted">{t('onboarding.consent.intro')}</Text>
      </View>
      <Card list>
        {POINTS.map(({ key, icon }, index) => (
          <View
            key={key}
            style={[
              styles.point,
              {
                gap: spacing.md,
                paddingVertical: ROW_PADDING,
                borderTopWidth: index > 0 ? StyleSheet.hairlineWidth : 0,
                borderTopColor: colors.border,
              },
            ]}
          >
            <IconTile name={icon} size={40} />
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
      <View style={{ marginTop: spacing.sm }}>
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
        color="primaryText"
        onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
      />
    </Screen>
  );
}

/** A small link, in the brand colour or, quieter, in grey. */
function TextLink({
  label,
  color,
  onPress,
}: {
  label: string;
  color: 'primaryText' | 'textMuted';
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={12}
      onPress={onPress}
      style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Text variant="captionStrong" color={color}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: {
    alignSelf: 'center',
    paddingVertical: 4,
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
