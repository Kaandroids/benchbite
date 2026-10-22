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

/**
 * The app's main screens behind the system's tab bar: a floating glass bar on iOS 26 and a
 * Material navigation bar on Android (ADR 0014).
 */
export default function AppLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <NativeTabs
      tintColor={colors.primary}
      backgroundColor={colors.surface}
      labelStyle={{ fontFamily: fonts.bold, color: colors.textMuted }}
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
