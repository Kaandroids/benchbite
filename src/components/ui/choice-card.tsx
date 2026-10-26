import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

import { CheckBox } from './check-box';
import { Icon, type IconName } from './icon';
import { LevelBars } from './level-bars';
import { RaisedPressable } from './raised-pressable';
import { Text } from './text';

/** The sizes of a card: its least height, its icon tile and icon, and its vertical padding. */
const SIZES = {
  regular: { minHeight: 68, tile: 44, icon: 22, padding: 'md' },
  compact: { minHeight: 56, tile: 36, icon: 18, padding: 'sm' },
  /** A tall card, the icon over the title, for two answers side by side. */
  tile: { minHeight: 112, tile: 48, icon: 24, padding: 'lg' },
} as const;

type ChoiceCardProps = {
  title: string;
  description?: string;
  icon?: IconName;
  selected: boolean;
  onPress: () => void;
  /** `radio` for one answer out of several, `checkbox` when several can be picked. */
  type?: 'radio' | 'checkbox';
  /** `compact` for a list that shares the screen with more below it. */
  size?: keyof typeof SIZES;
  /**
   * A level on a scale, such as how active or experienced: shown as rising bars in the icon's
   * place, or after the text when there is an icon.
   */
  level?: { value: number; of: number };
};

export function ChoiceCard({
  title,
  description,
  icon,
  selected,
  onPress,
  type = 'radio',
  size: sizeName = 'regular',
  level,
}: ChoiceCardProps) {
  const { colors, radii, spacing } = useTheme();
  const size = SIZES[sizeName];
  const stacked = sizeName === 'tile';
  // Without an icon, the level takes the tile; with one, it follows the text.
  const levelInTile = level && !icon;
  const scale = useSharedValue(1);
  const isFirstRender = useRef(true);

  // A short pop confirms a new selection, but not a card that is already selected when it appears.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (selected) {
      scale.value = withSequence(
        withTiming(1.03, { duration: 90 }),
        withTiming(1, { duration: 140 }),
      );
    }
  }, [selected, scale]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animatedStyle}>
      <RaisedPressable
        accessibilityRole={type}
        accessibilityLabel={description ? `${title}, ${description}` : title}
        accessibilityState={{ checked: selected }}
        onPress={onPress}
        haptic="selection"
        ledgeColor={selected ? colors.primary : colors.border}
        borderRadius={radii.lg}
        faceStyle={[
          styles.face,
          stacked ? styles.stackedFace : null,
          {
            minHeight: size.minHeight,
            gap: spacing.md,
            paddingVertical: spacing[size.padding],
            paddingHorizontal: spacing.md,
            backgroundColor: selected ? colors.selected : colors.surface,
            borderColor: selected ? colors.primary : colors.border,
          },
        ]}
      >
        {icon || levelInTile ? (
          <View
            style={[
              styles.iconTile,
              {
                width: size.tile,
                height: size.tile,
                borderRadius: radii.md,
                backgroundColor: selected ? colors.primary : colors.iconBackground,
              },
            ]}
          >
            {icon ? (
              <Icon name={icon} size={size.icon} color={selected ? 'onPrimary' : 'primary'} />
            ) : level ? (
              <LevelBars value={level.value} of={level.of} inverse={selected} />
            ) : null}
          </View>
        ) : null}
        <View style={[styles.text, stacked ? styles.stackedText : null]}>
          <Text variant="bodyStrong" align={stacked ? 'center' : undefined}>
            {title}
          </Text>
          {description ? (
            <Text variant="caption" color="textMuted" align={stacked ? 'center' : undefined}>
              {description}
            </Text>
          ) : null}
        </View>
        {level && icon ? <LevelBars value={level.value} of={level.of} /> : null}
        {type === 'checkbox' ? <CheckBox checked={selected} /> : null}
      </RaisedPressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  face: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
  },
  stackedFace: {
    flexDirection: 'column',
    justifyContent: 'center',
  },
  stackedText: {
    flex: 0,
    alignItems: 'center',
  },
  iconTile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
