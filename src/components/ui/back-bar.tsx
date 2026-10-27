import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Icon } from './icon';

/** The top of a screen opened from another: a back button, and an action at the end if any. */
export function BackBar({ action }: { action?: ReactNode }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <View style={[styles.bar, { paddingHorizontal: spacing.md }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        onPress={() => router.back()}
        style={styles.button}
      >
        <Icon name="back" color="text" />
      </Pressable>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
