import { usePathname } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { useTranslation } from 'react-i18next';

import { ICONS, type IconName } from '@/components/ui/icon';
import { fonts, useTheme } from '@/theme';

const TABS: {
  name: string;
  label: 'today' | 'workout' | 'nutrition' | 'progress';
  icon: IconName;
}[] = [
  { name: 'index', label: 'today', icon: 'home' },
  { name: 'workout', label: 'workout', icon: 'dumbbell' },
  { name: 'nutrition', label: 'nutrition', icon: 'meal' },
  { name: 'progress', label: 'progress', icon: 'chart' },
];

/** The tabs' own screens; the screens they open cover the tab bar. */
const TAB_ROOTS = ['/', '/workout', '/nutrition', '/progress'];

/**
 * The app's main screens behind the system's tab bar: a floating glass bar on iOS 26 and a
 * Material navigation bar on Android (ADR 0014). The bar shows only on the tabs' own screens, so
 * that a screen opened from one, such as a workout, has the whole height and its own buttons.
 */
export default function AppLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const pathname = usePathname();
  return (
    <NativeTabs
      hidden={!TAB_ROOTS.includes(pathname)}
      tintColor={colors.primary}
      backgroundColor={colors.surface}
      iconColor={{ default: colors.textMuted, selected: colors.primary }}
      labelStyle={{
        default: { fontFamily: fonts.bold, color: colors.textMuted },
        selected: { fontFamily: fonts.bold, color: colors.primary },
      }}
      // Android: every label stays visible, and the pill behind the selected icon is tinted with
      // the primary colour instead of Material's grey.
      labelVisibilityMode="labeled"
      indicatorColor={colors.iconBackground}
      rippleColor={colors.selected}
    >
      {TABS.map(({ name, label, icon }) => (
        <NativeTabs.Trigger key={name} name={name}>
          <NativeTabs.Trigger.Icon sf={ICONS[icon].ios} md={ICONS[icon].android} />
          <NativeTabs.Trigger.Label>{t(`tabs.${label}`)}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
