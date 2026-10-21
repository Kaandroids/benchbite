import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { useTheme, type ColorTokens } from '@/theme';

// One entry per icon the app uses: SF Symbols on iOS, Material Symbols on Android and web.
// Outlined variants on both, because Material Symbols render outlined by default.
const ICONS = {
  back: { ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' },
  bolt: { ios: 'bolt', android: 'bolt', web: 'bolt' },
  calendar: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  chart: { ios: 'chart.bar', android: 'bar_chart', web: 'bar_chart' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  dumbbell: { ios: 'dumbbell', android: 'fitness_center', web: 'fitness_center' },
  external: { ios: 'arrow.up.right', android: 'open_in_new', web: 'open_in_new' },
  flame: { ios: 'flame', android: 'local_fire_department', web: 'local_fire_department' },
  gym: { ios: 'building.2', android: 'apartment', web: 'apartment' },
  heart: { ios: 'heart', android: 'favorite', web: 'favorite' },
  home: { ios: 'house', android: 'home', web: 'home' },
  meal: { ios: 'fork.knife', android: 'restaurant', web: 'restaurant' },
  offline: { ios: 'wifi.slash', android: 'wifi_off', web: 'wifi_off' },
  person: { ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' },
  shield: { ios: 'lock.shield', android: 'shield', web: 'shield' },
  sparkles: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
  target: { ios: 'target', android: 'target', web: 'target' },
  timer: { ios: 'timer', android: 'timer', web: 'timer' },
} satisfies Record<string, Extract<SymbolViewProps['name'], object>>;

export type IconName = keyof typeof ICONS;

type IconProps = {
  name: IconName;
  size?: number;
  color?: keyof ColorTokens;
};

/** Decorative by default; give the surrounding control an accessibility label instead. */
export function Icon({ name, size = 24, color = 'text' }: IconProps) {
  const { colors } = useTheme();
  return (
    <SymbolView
      name={ICONS[name]}
      size={size}
      tintColor={colors[color]}
      weight="semibold"
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
