import { StyleSheet, View } from 'react-native';

import { useTheme, type ColorTokens } from '@/theme';

import type { IconName } from './icon';
import { IconTile } from './icon-tile';
import { RaisedPressable } from './raised-pressable';
import { Text } from './text';

type ActionCardProps = {
  icon: IconName;
  /** The icon's colour, and its tile's; the brand's tint by default. */
  iconColor?: keyof ColorTokens;
  iconBackground?: keyof ColorTokens;
  title: string;
  /** A line under the title, as what the action does. */
  hint: string;
  /** What the card does, for screen readers, when it says more than the title. */
  label?: string;
  /** Without it the card is shown disabled. */
  onPress?: () => void;
  /** Keeps the title and the hint to a line each, as in a card half a row wide. */
  singleLine?: boolean;
};

/** A raised card that does one thing: an icon tile, a title and a line about it. */
export function ActionCard({
  icon,
  iconColor = 'primary',
  iconBackground = 'iconBackground',
  title,
  hint,
  label,
  onPress,
  singleLine = false,
}: ActionCardProps) {
  const { colors, radii, spacing } = useTheme();
  const disabled = !onPress;
  const lines = singleLine ? 1 : undefined;
  return (
    <RaisedPressable
      accessibilityRole="button"
      accessibilityLabel={label ?? title}
      accessibilityHint={hint}
      disabled={disabled}
      onPress={onPress}
      haptic="selection"
      ledgeColor={colors.border}
      borderRadius={radii.lg}
      faceStyle={[
        styles.face,
        {
          gap: spacing.md,
          padding: spacing.md,
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <IconTile name={icon} color={iconColor} background={iconBackground} />
      <View style={styles.text}>
        <Text variant="bodyStrong" color={disabled ? 'textMuted' : 'text'} numberOfLines={lines}>
          {title}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={lines}>
          {hint}
        </Text>
      </View>
    </RaisedPressable>
  );
}

const styles = StyleSheet.create({
  face: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
