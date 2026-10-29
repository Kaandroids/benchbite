import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BRAND_ORANGE } from '@/brand/mark';
import { BiteFace } from '@/coach/bite-face';
import { fonts, useTheme } from '@/theme';

import { Icon, type IconName } from './ui/icon';
import { Text } from './ui/text';

/** The tabs, by route, in the order they are shown; Bite sits between the first two and the rest. */
export const TABS: {
  name: string;
  label: 'today' | 'workout' | 'nutrition' | 'progress';
  icon: IconName;
}[] = [
  { name: 'index', label: 'today', icon: 'home' },
  { name: 'workout', label: 'workout', icon: 'dumbbell' },
  { name: 'nutrition', label: 'nutrition', icon: 'meal' },
  { name: 'progress', label: 'progress', icon: 'chart' },
];

const BAR_HEIGHT = 64;
const BAR_MARGIN = 14;
const BITE_SIZE = 60;
/** How far Bite rises out of the bar. */
const BITE_RISE = 22;

/** The space the floating tab bar takes at the bottom, which a tab's content scrolls past. */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return barBottom(insets.bottom) + BAR_HEIGHT;
}

const barBottom = (inset: number) => Math.max(inset, BAR_MARGIN);

/** Whether the system draws Liquid Glass, as on iOS 26; elsewhere the bar is a plain surface. */
const glass = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

/**
 * The app's tab bar (ADR 0048): a capsule floating over the content, glass where the system has it,
 * with Bite rising out of its middle. The chosen tab's pill slides over to it and its icon pops.
 */
export function TabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  // Four tabs and Bite share the bar's width.
  const slot = width / 5;
  const slotOf = (tab: number) => (tab < 2 ? tab : tab + 1);

  const pill = useSharedValue(0);
  useEffect(() => {
    const x = slotOf(state.index) * slot;
    pill.set(reduceMotion || width === 0 ? x : withSpring(x, { damping: 16, stiffness: 180 }));
  }, [state.index, slot, width, reduceMotion, pill]);
  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pill.get() }] }));

  const press = (route: (typeof state.routes)[number], focused: boolean) => {
    const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) {
      navigateToTab(route.key);
    }
  };

  const tabs = state.routes.map((route, index) => {
    const tab = TABS.find((item) => item.name === route.name);
    return tab ? (
      <TabButton
        key={route.key}
        icon={tab.icon}
        label={t(`tabs.${tab.label}`)}
        focused={state.index === index}
        onPress={() => press(route, state.index === index)}
      />
    ) : null;
  });

  return (
    <View
      style={[
        styles.bar,
        {
          bottom: barBottom(insets.bottom),
          backgroundColor: glass ? undefined : colors.surface,
          borderColor: glass ? 'transparent' : colors.border,
        },
      ]}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width - 12)}
    >
      {glass ? <GlassView style={styles.glass} glassEffectStyle="regular" /> : null}
      <Animated.View
        style={[
          styles.pill,
          { width: slot - 8, backgroundColor: colors.iconBackground },
          pillStyle,
        ]}
      />
      {tabs.slice(0, 2)}
      <View style={styles.slot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tabs.bite')}
          onPress={() => router.push('/bite')}
          style={({ pressed }) => [
            styles.bite,
            {
              backgroundColor: BRAND_ORANGE,
              borderColor: colors.surface,
              shadowColor: colors.primaryButtonLedge,
              transform: [{ translateY: pressed ? 2 : 0 }],
            },
          ]}
        >
          <BiteFace size={BITE_SIZE - 10} />
        </Pressable>
      </View>
      {tabs.slice(2)}
    </View>
  );
}

type TabButtonProps = {
  icon: IconName;
  label: string;
  focused: boolean;
  onPress: () => void;
};

/** One tab: its icon and name, orange when it is open; its icon pops as it opens. */
function TabButton({ icon, label, focused, onPress }: TabButtonProps) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (focused && !reduceMotion) {
      scale.set(withSequence(withTiming(1.18, { duration: 120 }), withSpring(1, { damping: 10 })));
    }
  }, [focused, reduceMotion, scale]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      style={styles.slot}
    >
      <Animated.View style={iconStyle}>
        <Icon name={icon} size={24} color={focused ? 'primary' : 'textMuted'} />
      </Animated.View>
      <Text color={focused ? 'primaryText' : 'textMuted'} style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: BAR_MARGIN,
    right: BAR_MARGIN,
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    overflow: 'visible',
    shadowColor: '#16171A',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  glass: {
    ...StyleSheet.absoluteFill,
    borderRadius: BAR_HEIGHT / 2,
  },
  pill: {
    position: 'absolute',
    left: 10,
    top: 7,
    height: BAR_HEIGHT - 14,
    borderRadius: 22,
  },
  slot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    fontFamily: fonts.extraBold,
    fontSize: 10,
    lineHeight: 13,
  },
  bite: {
    width: BITE_SIZE,
    height: BITE_SIZE,
    borderRadius: BITE_SIZE / 2,
    borderWidth: 3,
    marginTop: -BITE_RISE,
    alignItems: 'center',
    justifyContent: 'center',
    // The ledge under it, as under the app's filled buttons.
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
});
