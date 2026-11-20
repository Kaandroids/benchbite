import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConsentBox } from '@/components/ui/consent-box';
import { Screen } from '@/components/ui/screen';
import { closeThen } from '@/components/ui/sheet';
import { StepHeading } from '@/components/ui/step-heading';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { PRIVACY_POLICY_URL } from '@/lib/links';
import { useWithdrawHealthConsent } from '@/privacy/consents';
import { ExportSheet } from '@/privacy/export-sheet';
import { WithdrawSheet } from '@/privacy/withdraw-sheet';
import { useTheme } from '@/theme';

import { useConsentAsk, useGiveHealthConsent } from './consent-update';

/** What the consent covers, in the onboarding's words. */
const POINTS = ['what', 'why'] as const;

/**
 * Asks the user for the health data consent again when its text changed (#690, ADR 0159), in
 * place of the app: what is collected and what for, what changed, the box to tick beside the
 * policy to read, and the button that records it. There is no "Later": the app cannot work on
 * health data without the consent. "I don't agree" leads to the withdrawal the settings offer,
 * which shows what is deleted before anything is (ADR 0145).
 */
export function ConsentUpdateScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const ask = useConsentAsk();
  const give = useGiveHealthConsent();
  const withdraw = useWithdrawHealthConsent();
  // The version the box was ticked for: a tick for another text does not count.
  const [checkedFor, setCheckedFor] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Nothing to ask, as right after the answer: the app takes this screen's place.
  if (!ask) return null;
  const { version } = ask;
  const checked = checkedFor === version;

  return (
    <Screen
      footer={
        <View style={{ gap: spacing.md }}>
          {give.isError ? (
            <Text variant="caption" color="danger" align="center" accessibilityLiveRegion="polite">
              {t('termsUpdate.failed')}
            </Text>
          ) : null}
          <Button
            label={t('consentUpdate.agree')}
            disabled={!checked}
            loading={give.isPending}
            onPress={() => give.mutate(version)}
          />
          <TextLink
            label={t('consentUpdate.decline')}
            size="regular"
            disabled={give.isPending}
            onPress={() => {
              withdraw.reset();
              setDeclining(true);
            }}
          />
          <Text variant="caption" color="textMuted" align="center">
            {t('consentUpdate.note')}
          </Text>
        </View>
      }
    >
      <StepHeading title={t('consentUpdate.title')} intro={t('consentUpdate.body')} />
      <View style={{ gap: spacing.lg }}>
        <Card style={{ gap: spacing.md }}>
          {POINTS.map((point) => (
            <View key={point} style={{ gap: spacing.xs }}>
              <Text variant="label">{t(`onboarding.consent.${point}.title`)}</Text>
              <Text color="textMuted">{t(`onboarding.consent.${point}.body`)}</Text>
            </View>
          ))}
          {ask.summary ? (
            <View style={{ gap: spacing.xs }}>
              <Text variant="label">{t('termsUpdate.changed')}</Text>
              <Text color="textMuted">{ask.summary}</Text>
            </View>
          ) : null}
        </Card>
        <ConsentBox
          title={t('onboarding.consent.agree')}
          checked={checked}
          onToggle={() => {
            give.reset();
            setCheckedFor(checked ? null : version);
          }}
          readLabel={t('common.readPolicy')}
          onRead={() => void Linking.openURL(PRIVACY_POLICY_URL)}
        />
      </View>
      {declining ? (
        <WithdrawSheet
          consent="health"
          withdrawing={withdraw.isPending}
          failed={withdraw.isError}
          // Withdrawn, the onboarding starts again and takes this screen's place.
          onWithdraw={() => withdraw.mutate()}
          onExport={closeThen(
            () => setDeclining(false),
            () => setExporting(true),
          )}
          onClose={() => setDeclining(false)}
        />
      ) : null}
      {exporting ? <ExportSheet onClose={() => setExporting(false)} /> : null}
    </Screen>
  );
}
