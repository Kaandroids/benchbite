import { useEffect, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

import { Icon, type IconName } from './icon';
import { RaisedPressable } from './raised-pressable';
import { Text } from './text';

type ChoiceCardProps = {
  title: string;
  description?: string;
  icon?: IconName;
  selected: boolean;
  onPress: () => void;
  /** `radio` for one answer out of several, `checkbox` when several can be picked. */
  type?: 'radio' | 'checkbox';
  /** `row` lists the answer across the screen; `tile` stacks it, for answers in a grid. */
  layout?: 'row' | 'tile';
  style?: StyleProp<ViewStyle>;
};

export function ChoiceCard({
  title,
  description,
  icon,
  selected,
  onPress,
  type = 'radio',
  layout = 'row',
  style,
}: ChoiceCardProps) {
  const tile = layout === 'tile';
  const { colors, radii, spacing } = useTheme();
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
    <Animated.View style={[animatedStyle, style]}>
      <RaisedPressable
        accessibilityRole={type}
        accessibilityLabel={description ? `${title}, ${description}` : title}
        accessibilityState={{ checked: selected }}
        onPress={onPress}
        haptic="selection"
        ledgeColor={selected ? colors.primary : colors.border}
        borderRadius={radii.lg}
        faceStyle={[
          tile ? styles.tileFace : styles.face,
          {
            gap: spacing.md,
            padding: tile ? spacing.lg : spacing.md,
            backgroundColor: selected ? colors.selected : colors.surface,
            borderColor: selected ? colors.primary : colors.border,
          },
        ]}
      >
        {icon ? (
          <View
            style={[
              tile ? styles.bigIconTile : styles.iconTile,
              {
                borderRadius: radii.md,
                backgroundColor: selected ? colors.primary : colors.iconBackground,
              },
            ]}
          >
            <Icon name={icon} size={tile ? 28 : 22} color={selected ? 'onPrimary' : 'primary'} />
          </View>
        ) : null}
        <View style={tile ? styles.tileText : styles.text}>
          <Text variant={tile ? 'headline' : 'bodyStrong'}>{title}</Text>
          {description ? (
            <Text variant="caption" color="textMuted">
              {description}
            </Text>
          ) : null}
        </View>
        {type === 'checkbox' ? (
          <View
            style={[
              styles.checkbox,
              {
                borderRadius: radii.sm,
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: selected ? colors.primary : 'transparent',
              },
            ]}
          >
            {selected ? <Icon name="check" size={16} color="onPrimary" /> : null}
          </View>
        ) : null}
        {tile && selected ? (
          <View style={[styles.tick, { backgroundColor: colors.primary }]}>
            <Icon name="check" size={14} color="onPrimary" />
          </View>
        ) : null}
      </RaisedPressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  face: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    minHeight: 68,
  },
  // A tile stacks its icon over the text and grows to fill its share of the grid.
  tileFace: {
    flexGrow: 1,
    justifyContent: 'space-between',
    borderWidth: 2,
    minHeight: 200,
  },
  bigIconTile: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: {
    gap: 2,
  },
  tick: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTile: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
