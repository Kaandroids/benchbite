import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConsentBox } from '@/components/ui/consent-box';
import { Screen } from '@/components/ui/screen';
import { StepHeading } from '@/components/ui/step-heading';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { useDateFormat } from '@/i18n/dates';
import { TERMS_URL } from '@/lib/links';
import { ExportSheet } from '@/privacy/export-sheet';
import { useTheme } from '@/theme';

import { useAcceptTerms, usePutOffTerms, useTermsAsk } from './terms-update';

/**
 * Asks the user to accept the terms of use again when they changed (#689, ADR 0158), in place of
 * the app: what changed, the box to tick beside the terms to read, and the button that records
 * it. Before the day the terms apply, "Later" puts the question off until tomorrow. From that day
 * there is no way past it, only the ways to take the data along or to delete the account.
 */
export function TermsUpdateScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const formatDate = useDateFormat('long');
  const ask = useTermsAsk();
  const accept = useAcceptTerms();
  const putOff = usePutOffTerms();
  // The version the box was ticked for: a tick for other terms does not count.
  const [checkedFor, setCheckedFor] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Nothing to ask, as right after the answer: the app takes this screen's place.
  if (!ask) return null;
  const { version, due } = ask;
  const checked = checkedFor === version;
  const state = due ? 'due' : 'announced';

  return (
    <Screen
      footer={
        <View style={{ gap: spacing.md }}>
          {accept.isError ? (
            <Text variant="caption" color="danger" align="center" accessibilityLiveRegion="polite">
              {t('common.saveFailed')}
            </Text>
          ) : null}
          <Button
            label={t('termsUpdate.accept')}
            disabled={!checked}
            loading={accept.isPending}
            onPress={() => accept.mutate(version)}
          />
          {due ? (
            <View style={[styles.ways, { gap: spacing.xl }]}>
              <TextLink
                label={t('termsUpdate.export')}
                size="regular"
                onPress={() => setExporting(true)}
              />
              <TextLink
                label={t('termsUpdate.delete')}
                size="regular"
                onPress={() => router.push('/account/delete')}
              />
            </View>
          ) : (
            <TextLink
              label={t('termsUpdate.later')}
              size="regular"
              disabled={accept.isPending}
              onPress={() => putOff(version)}
            />
          )}
        </View>
      }
    >
      <StepHeading
        title={t(`termsUpdate.${state}.title`)}
        // Only the announcement names the day; one that cannot be read counts as come.
        intro={t(`termsUpdate.${state}.body`, {
          date: due ? undefined : formatDate(ask.appliesAt),
        })}
      />
      <View style={{ gap: spacing.lg }}>
        {ask.summary ? (
          <Card style={{ gap: spacing.xs }}>
            <Text variant="label">{t('common.whatChanged')}</Text>
            <Text color="textMuted">{ask.summary}</Text>
          </Card>
        ) : null}
        <ConsentBox
          title={t('onboarding.consent.terms')}
          checked={checked}
          onToggle={() => {
            accept.reset();
            setCheckedFor(checked ? null : version);
          }}
          readLabel={t('onboarding.consent.readTerms')}
          onRead={() => void Linking.openURL(TERMS_URL)}
        />
      </View>
      {exporting ? <ExportSheet onClose={() => setExporting(false)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  ways: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
});
