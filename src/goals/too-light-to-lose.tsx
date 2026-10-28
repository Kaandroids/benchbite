import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

/**
 * Why someone at the lower end of a healthy weight is not asked for a target to lose fat, in the
 * middle of the screen; the screen's button leads back to the goals.
 */
export function TooLightToLose() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <View style={[styles.centered, { gap: spacing.lg }]}>
      <IconTile name="heart" size={88} />
      <Text color="textMuted" align="center">
        {t('goals.targetWeight.alreadyLow')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
