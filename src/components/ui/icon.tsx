import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { useTheme, type ColorTokens } from '@/theme';

// One entry per icon the app uses: SF Symbols on iOS, Material Symbols on Android and web.
const ICONS = {
  back: { ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' },
  bolt: { ios: 'bolt.fill', android: 'bolt', web: 'bolt' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  dumbbell: { ios: 'dumbbell.fill', android: 'fitness_center', web: 'fitness_center' },
  flame: { ios: 'flame.fill', android: 'local_fire_department', web: 'local_fire_department' },
  heart: { ios: 'heart.fill', android: 'favorite', web: 'favorite' },
  offline: { ios: 'wifi.slash', android: 'wifi_off', web: 'wifi_off' },
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
