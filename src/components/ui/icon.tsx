import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { useTheme, type ColorTokens } from '@/theme';

// One entry per icon the app uses: SF Symbols on iOS, Material Symbols on Android and web.
// Outlined variants on both, because Material Symbols render outlined by default.
export const ICONS = {
  archive: { ios: 'archivebox', android: 'inventory_2', web: 'inventory_2' },
  back: { ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' },
  bell: { ios: 'bell', android: 'notifications', web: 'notifications' },
  bolt: { ios: 'bolt', android: 'bolt', web: 'bolt' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  chart: { ios: 'chart.bar', android: 'bar_chart', web: 'bar_chart' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  drag: { ios: 'line.3.horizontal', android: 'drag_indicator', web: 'drag_indicator' },
  dumbbell: { ios: 'dumbbell', android: 'fitness_center', web: 'fitness_center' },
  edit: { ios: 'pencil', android: 'edit', web: 'edit' },
  flame: { ios: 'flame', android: 'local_fire_department', web: 'local_fire_department' },
  forward: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  gym: { ios: 'building.2', android: 'apartment', web: 'apartment' },
  heart: { ios: 'heart', android: 'favorite', web: 'favorite' },
  home: { ios: 'house', android: 'home', web: 'home' },
  info: { ios: 'info', android: 'info_i', web: 'info_i' },
  meal: { ios: 'fork.knife', android: 'restaurant', web: 'restaurant' },
  minus: { ios: 'minus', android: 'remove', web: 'remove' },
  moon: { ios: 'moon', android: 'bedtime', web: 'bedtime' },
  offline: { ios: 'wifi.slash', android: 'wifi_off', web: 'wifi_off' },
  person: { ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' },
  play: { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' },
  plus: { ios: 'plus', android: 'add', web: 'add' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  shield: { ios: 'lock.shield', android: 'shield', web: 'shield' },
  snowflake: { ios: 'snowflake', android: 'ac_unit', web: 'ac_unit' },
  stop: { ios: 'stop.fill', android: 'stop', web: 'stop' },
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
