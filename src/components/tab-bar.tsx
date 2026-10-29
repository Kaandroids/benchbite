import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, useTheme } from '@/theme';

import { TAB_BAR, tabBarBottom } from './tab-space';
import { Icon, type IconName } from './ui/icon';
import { Text } from './ui/text';

/** The tabs, by route, in the order they are shown. */
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

/** The path of a tab's own screen. */
export const tabPath = (name: string) => (name === 'index' ? '/' : `/${name}`);

/** How many tabs come before the button in the middle. */
const MIDDLE_AFTER = 2;
/** The tabs and the button in the middle share the bar's width. */
const SLOTS = TABS.length + 1;
/** The room between a tab's pill and the next tab. */
const PILL_INSET = 4;

/** Whether the system draws Liquid Glass, as on iOS 26; elsewhere the bar is a plain surface. */
const glass = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

type TabBarProps = BottomTabBarProps & {
  /** The button in the middle of the bar, which rises out of it. */
  middle: ReactNode;
  /** Off a tab's own screen; the bar stays mounted, so that its pill stays where it was. */
  hidden: boolean;
};

/**
 * The app's tab bar (ADR 0048): a capsule floating over the content, glass where the system has it,
 * with a button rising out of its middle. The open tab's pill glides over to it and its icon pops.
 */
export function TabBar({ state, emitter, navigateToTab, middle, hidden }: TabBarProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const slot = (width - 2 * TAB_BAR.padding) / SLOTS;
  const slotOf = (tab: number) => (tab < MIDDLE_AFTER ? tab : tab + 1);

  const pill = useSharedValue(0);
  // The first place the pill takes, once the bar is measured, is not a move.
  const placed = useRef(false);
  useEffect(() => {
    if (width === 0) {
      return;
    }
    const x = slotOf(state.index) * slot;
    pill.set(
      placed.current && !reduceMotion
        ? withTiming(x, { duration: 220, easing: Easing.out(Easing.cubic) })
        : x,
    );
    placed.current = true;
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
    // Tall enough for the button that rises out of the bar, so that all of it takes a touch;
    // the rest of it lets touches through to the screen.
    <View
      pointerEvents="box-none"
      style={[
        styles.root,
        { bottom: tabBarBottom(insets.bottom), display: hidden ? 'none' : 'flex' },
      ]}
    >
      <View
        style={[
          styles.bar,
          {
            backgroundColor: glass ? undefined : colors.surface,
            borderColor: glass ? 'transparent' : colors.border,
          },
        ]}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {glass ? <GlassView style={styles.glass} glassEffectStyle="regular" /> : null}
        <Animated.View
          style={[
            styles.pill,
            { width: slot - 2 * PILL_INSET, backgroundColor: colors.iconBackground },
            pillStyle,
          ]}
        />
        {tabs.slice(0, MIDDLE_AFTER)}
        <View style={styles.slot} />
        {tabs.slice(MIDDLE_AFTER)}
      </View>
      <View
        pointerEvents="box-none"
        style={[styles.middle, { left: TAB_BAR.padding + MIDDLE_AFTER * slot, width: slot }]}
      >
        {middle}
      </View>
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
  // Only a tab opening pops, not one open as the bar appears.
  const shown = useRef(false);
  useEffect(() => {
    if (focused && shown.current && !reduceMotion) {
      scale.set(withSequence(withTiming(1.18, { duration: 120 }), withSpring(1, { damping: 10 })));
    }
    shown.current = true;
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
  root: {
    position: 'absolute',
    left: TAB_BAR.margin,
    right: TAB_BAR.margin,
    height: TAB_BAR.height + TAB_BAR.rise,
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: TAB_BAR.height,
    borderRadius: TAB_BAR.height / 2,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: TAB_BAR.padding,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  glass: {
    ...StyleSheet.absoluteFill,
    borderRadius: TAB_BAR.height / 2,
  },
  pill: {
    position: 'absolute',
    left: TAB_BAR.padding + PILL_INSET,
    top: 7,
    height: TAB_BAR.height - 14,
    borderRadius: 22,
  },
  slot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  middle: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
  },
  label: {
    fontFamily: fonts.extraBold,
    fontSize: 10,
    lineHeight: 13,
  },
});
