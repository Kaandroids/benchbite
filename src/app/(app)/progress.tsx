import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ComingSoon } from '@/components/coming-soon';
import { DevButton } from '@/dev/dev-button';
import { SettingsButton } from '@/settings/settings-button';
import { useTheme } from '@/theme';

export default function ProgressTab() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <ComingSoon
      icon="chart"
      message={t('comingSoon.progress')}
      title={t('tabs.progress')}
      action={
        <View style={[styles.actions, { gap: spacing.sm }]}>
          <DevButton />
          <SettingsButton />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
  },
});
