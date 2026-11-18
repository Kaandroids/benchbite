import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { CheckBox } from '@/components/ui/check-box';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { LEDGE_HEIGHT, useTheme } from '@/theme';

type ConsentBoxProps = {
  /** What the user agrees to by ticking the box. */
  title: string;
  checked: boolean;
  onToggle: () => void;
  /** Names the text to read for the screen reader, such as "Read the privacy policy". */
  readLabel: string;
  onRead: () => void;
};

/**
 * A box to tick for one consent, with a button beside it that opens the text it agrees to. The two
 * are apart, side by side in one raised card, so that reading never ticks the box and a screen
 * reader reaches both.
 */
export function ConsentBox({ title, checked, onToggle, readLabel, onRead }: ConsentBoxProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const edge = checked ? colors.primary : colors.border;
  return (
    <View style={{ paddingBottom: LEDGE_HEIGHT, borderRadius: radii.lg, backgroundColor: edge }}>
      <View
        style={[
          styles.face,
          {
            borderRadius: radii.lg,
            borderColor: edge,
            backgroundColor: checked ? colors.selected : colors.surface,
          },
        ]}
      >
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={title}
          accessibilityState={{ checked }}
          onPress={() => {
            void Haptics.selectionAsync();
            onToggle();
          }}
          style={({ pressed }) => [
            styles.box,
            {
              gap: spacing.md,
              padding: spacing.md,
              backgroundColor: pressed ? colors.trackPressed : undefined,
            },
          ]}
        >
          <CheckBox checked={checked} />
          <Text variant="bodyStrong" style={styles.title}>
            {title}
          </Text>
        </Pressable>
        <View style={[styles.divider, { backgroundColor: edge }]} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={readLabel}
          onPress={onRead}
          style={({ pressed }) => [
            styles.read,
            { backgroundColor: pressed ? colors.trackPressed : undefined },
          ]}
        >
          <Icon name="document" size={20} color="primaryText" />
          <Text variant="captionStrong" color="primaryText">
            {t('common.read')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  face: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 2,
    overflow: 'hidden',
  },
  box: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 68,
  },
  title: {
    flex: 1,
  },
  divider: {
    width: 1,
  },
  read: {
    width: 68,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
});
