import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
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
  /** Smaller, for a list that shares the screen with more below it. */
  compact?: boolean;
};

export function ChoiceCard({
  title,
  description,
  icon,
  selected,
  onPress,
  type = 'radio',
  compact = false,
}: ChoiceCardProps) {
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
          compact ? styles.compactFace : null,
          {
            gap: spacing.md,
            padding: compact ? spacing.sm : spacing.md,
            paddingHorizontal: spacing.md,
            backgroundColor: selected ? colors.selected : colors.surface,
            borderColor: selected ? colors.primary : colors.border,
          },
        ]}
      >
        {icon ? (
          <View
            style={[
              compact ? styles.compactIconTile : styles.iconTile,
              {
                borderRadius: radii.md,
                backgroundColor: selected ? colors.primary : colors.iconBackground,
              },
            ]}
          >
            <Icon name={icon} size={compact ? 18 : 22} color={selected ? 'onPrimary' : 'primary'} />
          </View>
        ) : null}
        <View style={styles.text}>
          <Text variant="bodyStrong">{title}</Text>
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
  compactFace: {
    minHeight: 56,
  },
  compactIconTile: {
    width: 36,
    height: 36,
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
