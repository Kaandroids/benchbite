import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

/** The settings' way to the licences and credits (#29): a row of its own, under the sections. */
export function LicencesRow() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <Card list>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/licences')}
        style={({ pressed }) => [
          styles.row,
          { gap: spacing.md, paddingVertical: spacing.md, opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <View style={styles.flex}>
          <Text variant="label">{t('licences.title')}</Text>
          <Text variant="caption" color="textMuted">
            {t('settings.licences.rowBody')}
          </Text>
        </View>
        <Icon name="forward" size={18} color="textMuted" />
      </Pressable>
    </Card>
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
