import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { afterSheetCloses, Sheet, SheetTitle } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { useTheme } from '@/theme';

import { shareExport, useWriteExport } from './export';

/** What the file holds, as the user knows it. */
const HOLDS = [
  'settings.privacy.export.holds.profile',
  'settings.privacy.export.holds.training',
  'settings.privacy.export.holds.food',
  'settings.privacy.export.holds.bite',
  'settings.privacy.export.holds.consents',
] as const;

type ExportSheetProps = {
  onClose: () => void;
};

/**
 * Exports all of the user's data (#553): what the file holds, then a button that makes it and,
 * once the sheet has closed, opens the phone's share sheet, which iOS would not show over it.
 */
export function ExportSheet({ onClose }: ExportSheetProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const write = useWriteExport();

  const exportData = () =>
    write.mutate(undefined, {
      onSuccess: (file) => {
        onClose();
        afterSheetCloses(() => {
          // Closing the share sheet without sharing is no failure, and nothing is left to show it.
          shareExport(file, t('settings.privacy.export.title')).catch(() => {});
        });
      },
    });

  return (
    <Sheet onClose={write.isPending ? () => {} : onClose}>
      <View style={{ gap: spacing.sm }}>
        <SheetTitle>{t('settings.privacy.export.title')}</SheetTitle>
        <Text color="textMuted">{t('settings.privacy.export.body')}</Text>
      </View>
      <View
        style={{
          gap: spacing.sm,
          padding: spacing.lg,
          borderRadius: radii.lg,
          backgroundColor: colors.waterBackground,
        }}
      >
        <Text variant="label">{t('settings.privacy.export.holdsTitle')}</Text>
        {HOLDS.map((key) => (
          <View key={key} style={[styles.line, { gap: spacing.sm }]}>
            <Icon name="check" size={18} color="water" />
            <Text style={styles.flex}>{t(key)}</Text>
          </View>
        ))}
      </View>
      <Text variant="caption" color="textMuted">
        {t('settings.privacy.export.format')}
      </Text>
      {write.isError ? (
        <Text variant="caption" color="danger" align="center" accessibilityLiveRegion="polite">
          {t('settings.privacy.export.failed')}
        </Text>
      ) : null}
      <Button
        label={t('settings.privacy.export.confirm')}
        loading={write.isPending}
        onPress={exportData}
      />
      <TextLink
        label={t('editor.cancel')}
        tone="muted"
        size="regular"
        disabled={write.isPending}
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
