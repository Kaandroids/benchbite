import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import { BiteAvatar } from '@/coach/bite-avatar';
import { Button } from '@/components/ui/button';
import { Card, listDivider } from '@/components/ui/card';
import type { IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { PRIVACY_POLICY_URL } from '@/lib/links';
import { ConsentBox } from '@/onboarding/consent-box';
import { TONES, useTheme, type Tone } from '@/theme';

import { useGiveAiConsent } from './consent';

const POINTS: { key: 'what' | 'who' | 'control'; icon: IconName; tone: Tone }[] = [
  { key: 'what', icon: 'chat', tone: 'dinner' },
  { key: 'who', icon: 'lock', tone: 'water' },
  { key: 'control', icon: 'shield', tone: 'snack' },
];

type AiConsentScreenProps = {
  /** Called once the consent is saved. */
  onGiven?: () => void;
  /** Leaves without consenting. */
  onClose: () => void;
};

/**
 * Explicit consent to send health data to Google for the AI features (#290, ADR 0142), asked when
 * the user first opens Bite or takes a meal photo, never in the onboarding. Like the onboarding's,
 * the box starts unticked beside the text it agrees to; Not now leaves without it.
 */
export function AiConsentScreen({ onGiven, onClose }: AiConsentScreenProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const [checked, setChecked] = useState(false);
  const give = useGiveAiConsent();

  return (
    <Screen
      onBack={onClose}
      closes
      footer={
        <View style={{ gap: spacing.sm }}>
          {give.isError ? (
            <Text variant="caption" color="danger" align="center">
              {t('bite.consent.notSaved')}
            </Text>
          ) : null}
          <Button
            label={t('common.continue')}
            disabled={!checked}
            loading={give.isPending}
            onPress={() => give.mutate(undefined, { onSuccess: onGiven })}
          />
          <Button
            label={t('bite.consent.notNow')}
            variant="ghost"
            disabled={give.isPending}
            onPress={onClose}
          />
        </View>
      }
    >
      <View style={[styles.heading, { gap: spacing.md }]}>
        <BiteAvatar size={56} />
        <Text variant="title" accessibilityRole="header" style={styles.flex}>
          {t('bite.consent.title')}
        </Text>
      </View>
      <Text color="textMuted">{t('bite.consent.intro')}</Text>
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
            <View style={[styles.flex, styles.pointText]}>
              <Text variant="label">{t(`bite.consent.${key}.title`)}</Text>
              <Text variant="caption" color="textMuted">
                {t(`bite.consent.${key}.body`)}
              </Text>
            </View>
          </View>
        ))}
      </Card>
      <View style={{ marginTop: spacing.md }}>
        <ConsentBox
          title={t('bite.consent.agree')}
          checked={checked}
          onToggle={() => setChecked(!checked)}
          readLabel={t('onboarding.consent.readPolicy')}
          onRead={() => void Linking.openURL(PRIVACY_POLICY_URL)}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  point: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pointText: {
    gap: 2,
  },
  flex: {
    flex: 1,
  },
});
