import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Card, listDivider } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { PillButton } from '@/components/ui/pill-button';
import { Text } from '@/components/ui/text';
import { useDateFormat } from '@/i18n/dates';
import { PRIVACY_POLICY_URL } from '@/lib/links';
import { useIsAccount } from '@/providers/session-provider';
import { useTheme } from '@/theme';

import {
  useConsents,
  useWithdrawAiConsent,
  useWithdrawHealthConsent,
  type Consent,
} from './consents';
import { WithdrawSheet } from './withdraw-sheet';

/**
 * The settings' privacy section (#652): each consent with when it was given and a way to withdraw
 * it, which asks first in a sheet; the AI consent, when not given, a way to give it; and the
 * privacy policy. Guests see only the health data consent, as the AI features need an account.
 */
export function PrivacySection() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const isAccount = useIsAccount();
  const consents = useConsents();
  const withdrawHealth = useWithdrawHealthConsent();
  const withdrawAi = useWithdrawAiConsent();
  const [asking, setAsking] = useState<Consent | null>(null);
  const withdrawing = asking === 'ai' ? withdrawAi : withdrawHealth;

  const ask = (consent: Consent) => {
    withdrawHealth.reset();
    withdrawAi.reset();
    setAsking(consent);
  };
  const shown: Consent[] = isAccount ? ['health', 'ai'] : ['health'];

  return (
    <>
      <Card list>
        {shown.map((consent, index) => (
          <ConsentRow
            key={consent}
            consent={consent}
            given={consents.data?.[consent]}
            loaded={consents.isSuccess}
            first={index === 0}
            onWithdraw={() => ask(consent)}
          />
        ))}
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
          style={({ pressed }) => [
            styles.row,
            { gap: spacing.md, paddingVertical: spacing.md, opacity: pressed ? 0.6 : 1 },
            listDivider(false, colors.border),
          ]}
        >
          <Text variant="label" style={styles.flex}>
            {t('settings.privacy.policy')}
          </Text>
          <Icon name="link" size={18} color="textMuted" />
        </Pressable>
      </Card>
      <Text variant="caption" color="textMuted">
        {t('settings.privacy.note')}
      </Text>
      {asking ? (
        <WithdrawSheet
          consent={asking}
          withdrawing={withdrawing.isPending}
          failed={withdrawing.isError}
          onWithdraw={() => withdrawing.mutate(undefined, { onSuccess: () => setAsking(null) })}
          onClose={() => setAsking(null)}
        />
      ) : null}
    </>
  );
}

type ConsentRowProps = {
  consent: Consent;
  /** When it was given, if it holds. */
  given?: Date;
  /** Whether the consents were read, so that nothing is offered before it is known. */
  loaded: boolean;
  first: boolean;
  onWithdraw: () => void;
};

/** A consent, given on a day with a way to withdraw it, or not given with a way to give it. */
function ConsentRow({ consent, given, loaded, first, onWithdraw }: ConsentRowProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const date = useDateFormat('medium');
  return (
    <View
      style={[
        styles.row,
        { gap: spacing.md, paddingVertical: spacing.md },
        listDivider(first, colors.border),
      ]}
    >
      <View style={styles.flex}>
        <Text variant="label">{t(`settings.privacy.${consent}.title`)}</Text>
        {loaded ? (
          <Text variant="caption" color="textMuted">
            {given
              ? t('settings.privacy.givenOn', { date: date(given) })
              : t('settings.privacy.notGiven')}
          </Text>
        ) : null}
      </View>
      {!loaded ? null : given ? (
        <PillButton
          label={t('settings.privacy.withdraw')}
          accessibilityLabel={t(`settings.privacy.${consent}.withdrawLabel`)}
          variant="danger"
          onPress={onWithdraw}
        />
      ) : consent === 'ai' ? (
        <PillButton
          label={t('settings.privacy.give')}
          variant="neutral"
          onPress={() => router.push('/ai-consent')}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
});
