import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/theme';

import { BiteAvatar } from './bite-avatar';

const SIZE = 60;
const RING = 3;

/** Bite in the middle of the tab bar (ADR 0048): pressing it opens its chat over the tabs. */
export function BiteButton() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('tabs.bite')}
      onPress={() => router.push('/bite')}
      style={({ pressed }) => [
        styles.button,
        {
          borderColor: colors.surface,
          shadowColor: colors.primaryButtonLedge,
          transform: [{ translateY: pressed ? 2 : 0 }],
        },
      ]}
    >
      <BiteAvatar size={SIZE - 2 * RING} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: RING,
    alignItems: 'center',
    justifyContent: 'center',
    // The ledge under it, as under the app's filled buttons.
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
});
