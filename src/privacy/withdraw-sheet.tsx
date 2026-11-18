import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Sheet, SheetTitle } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { useTheme } from '@/theme';

/** The consents a withdrawal is asked for. */
export type Withdrawn = 'health' | 'ai';

/** What each withdrawal deletes, as the user knows it. */
const DELETES = {
  health: [
    'settings.privacy.health.deletes.profile',
    'settings.privacy.health.deletes.logs',
    'settings.privacy.health.deletes.bite',
  ],
  ai: ['settings.privacy.ai.deletes.chats', 'settings.privacy.ai.deletes.notebook'],
} as const;

type WithdrawSheetProps = {
  consent: Withdrawn;
  /** Withdraws it; the sheet waits while it does. */
  onWithdraw: () => void;
  withdrawing: boolean;
  failed: boolean;
  onClose: () => void;
};

/**
 * Asks once more before a consent is withdrawn (#652): what goes and what stays, then a button that
 * withdraws it and deletes, as the server does (ADR 0143, 0144).
 */
export function WithdrawSheet({
  consent,
  onWithdraw,
  withdrawing,
  failed,
  onClose,
}: WithdrawSheetProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  return (
    <Sheet onClose={withdrawing ? () => {} : onClose}>
      <View style={{ gap: spacing.sm }}>
        <SheetTitle>{t(`settings.privacy.${consent}.withdrawTitle`)}</SheetTitle>
        <Text color="textMuted">{t(`settings.privacy.${consent}.withdrawBody`)}</Text>
      </View>
      <View
        style={{
          gap: spacing.sm,
          padding: spacing.lg,
          borderRadius: radii.lg,
          backgroundColor: colors.dangerBackground,
        }}
      >
        <Text variant="label">{t('settings.privacy.deletes')}</Text>
        {DELETES[consent].map((key) => (
          <View key={key} style={[styles.line, { gap: spacing.sm }]}>
            <Icon name="trash" size={18} color="danger" />
            <Text style={styles.flex}>{t(key)}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.line, { gap: spacing.sm }]}>
        <Icon name="check" size={18} color="success" />
        <Text style={styles.flex}>{t(`settings.privacy.${consent}.stays`)}</Text>
      </View>
      {failed ? (
        <Text variant="caption" color="danger" align="center" accessibilityLiveRegion="polite">
          {t('settings.privacy.failed')}
        </Text>
      ) : null}
      <Button
        label={t('settings.privacy.confirm')}
        variant="danger"
        loading={withdrawing}
        onPress={onWithdraw}
      />
      <TextLink
        label={t('editor.cancel')}
        tone="muted"
        size="regular"
        disabled={withdrawing}
        onPress={onClose}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  flex: {
    flex: 1,
  },
});
