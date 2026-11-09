import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { useStoreName } from './use-store-name';
import type { SavedToHealth } from './workout-write';

/** Where a logged workout is in the store: saved by Benchbite, or recorded by the watch (ADR 0105). */
export function SavedToHealthLine({ saved }: { saved: SavedToHealth }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const store = useStoreName();
  if (!store) return null;
  return (
    <View style={[styles.row, { gap: spacing.sm }]}>
      <Icon
        name={saved === 'saved' ? 'check' : 'watch'}
        size={16}
        color={saved === 'saved' ? 'success' : 'textMuted'}
      />
      <Text
        variant={saved === 'saved' ? 'label' : 'caption'}
        color={saved === 'saved' ? 'success' : 'textMuted'}
        style={styles.flex}
      >
        {t(`health.write.${saved}`, { store })}
      </Text>
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
