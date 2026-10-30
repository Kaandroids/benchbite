import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { useTheme, type ColorTokens } from '@/theme';

// One entry per icon the app uses: SF Symbols on iOS, Material Symbols on Android and web.
// Outlined variants on both, because Material Symbols render outlined by default.
export const ICONS = {
  account: { ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' },
  archive: { ios: 'archivebox', android: 'inventory_2', web: 'inventory_2' },
  arrow: { ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' },
  arrowDown: { ios: 'arrow.down', android: 'arrow_downward', web: 'arrow_downward' },
  arrowUp: { ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' },
  average: { ios: 'slash.circle', android: 'block', web: 'block' },
  back: { ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' },
  bell: { ios: 'bell', android: 'notifications', web: 'notifications' },
  bellOff: { ios: 'bell.slash', android: 'notifications_off', web: 'notifications_off' },
  bolt: { ios: 'bolt', android: 'bolt', web: 'bolt' },
  calendar: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  camera: { ios: 'camera', android: 'photo_camera', web: 'photo_camera' },
  chair: { ios: 'chair', android: 'chair', web: 'chair' },
  chart: { ios: 'chart.bar', android: 'bar_chart', web: 'bar_chart' },
  code: { ios: 'chevron.left.forwardslash.chevron.right', android: 'code', web: 'code' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  down: { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' },
  drag: { ios: 'line.3.horizontal', android: 'drag_indicator', web: 'drag_indicator' },
  dumbbell: { ios: 'dumbbell', android: 'fitness_center', web: 'fitness_center' },
  edit: { ios: 'pencil', android: 'edit', web: 'edit' },
  error: { ios: 'exclamationmark.circle', android: 'error', web: 'error' },
  eye: { ios: 'eye', android: 'visibility', web: 'visibility' },
  eyeOff: { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' },
  flame: { ios: 'flame', android: 'local_fire_department', web: 'local_fire_department' },
  forward: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  gym: { ios: 'building.2', android: 'apartment', web: 'apartment' },
  history: { ios: 'clock.arrow.circlepath', android: 'history', web: 'history' },
  hammer: { ios: 'hammer', android: 'construction', web: 'construction' },
  heart: { ios: 'heart', android: 'favorite', web: 'favorite' },
  home: { ios: 'house', android: 'home', web: 'home' },
  info: { ios: 'info', android: 'info_i', web: 'info_i' },
  left: { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' },
  layers: { ios: 'square.stack.3d.up', android: 'layers', web: 'layers' },
  logOut: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' },
  man: { ios: 'figure.stand', android: 'man', web: 'man' },
  meal: { ios: 'fork.knife', android: 'restaurant', web: 'restaurant' },
  minus: { ios: 'minus', android: 'remove', web: 'remove' },
  missed: { ios: 'calendar.badge.exclamationmark', android: 'event_busy', web: 'event_busy' },
  moon: { ios: 'moon', android: 'bedtime', web: 'bedtime' },
  notSaid: { ios: 'minus.circle', android: 'do_not_disturb_on', web: 'do_not_disturb_on' },
  offline: { ios: 'wifi.slash', android: 'wifi_off', web: 'wifi_off' },
  person: { ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' },
  personOff: { ios: 'person.crop.circle.badge.xmark', android: 'person_off', web: 'person_off' },
  play: { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' },
  plus: { ios: 'plus', android: 'add', web: 'add' },
  redo: { ios: 'arrow.counterclockwise', android: 'replay', web: 'replay' },
  run: { ios: 'figure.run', android: 'directions_run', web: 'directions_run' },
  scale: { ios: 'scalemass', android: 'monitor_weight', web: 'monitor_weight' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings' },
  shield: { ios: 'lock.shield', android: 'shield', web: 'shield' },
  snack: { ios: 'carrot', android: 'nutrition', web: 'nutrition' },
  speed: { ios: 'speedometer', android: 'speed', web: 'speed' },
  snowflake: { ios: 'snowflake', android: 'ac_unit', web: 'ac_unit' },
  stop: { ios: 'stop.fill', android: 'stop', web: 'stop' },
  star: { ios: 'star', android: 'star', web: 'star' },
  sun: { ios: 'sun.max', android: 'light_mode', web: 'light_mode' },
  sunrise: { ios: 'sunrise', android: 'wb_twilight', web: 'wb_twilight' },
  target: { ios: 'target', android: 'target', web: 'target' },
  timer: { ios: 'timer', android: 'timer', web: 'timer' },
  trash: { ios: 'trash', android: 'delete', web: 'delete' },
  trend: { ios: 'chart.line.uptrend.xyaxis', android: 'show_chart', web: 'show_chart' },
  trophy: { ios: 'trophy', android: 'trophy', web: 'trophy' },
  undo: { ios: 'arrow.uturn.backward', android: 'undo', web: 'undo' },
  water: { ios: 'drop', android: 'water_drop', web: 'water_drop' },
  warning: { ios: 'exclamationmark.triangle', android: 'warning', web: 'warning' },
  woman: { ios: 'figure.stand.dress', android: 'woman', web: 'woman' },
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
