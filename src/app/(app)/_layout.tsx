import { usePathname } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { TABS, TabBar } from '@/components/tab-bar';
import { useTheme } from '@/theme';

/** The tabs' own screens; the screens they open cover the tab bar. */
const TAB_ROOTS = ['/', '/workout', '/nutrition', '/progress'];

/**
 * The app's main screens behind our own tab bar (ADR 0048): a floating capsule, glass on iOS 26,
 * with Bite in the middle. The bar shows only on the tabs' own screens, so that a screen opened
 * from one, such as a workout, has the whole height and its own buttons.
 */
export default function AppLayout() {
  const { colors } = useTheme();
  const pathname = usePathname();
  return (
    <Tabs
      tabBar={(props) => (TAB_ROOTS.includes(pathname) ? <TabBar {...props} /> : null)}
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      {TABS.map(({ name }) => (
        <Tabs.Screen key={name} name={name} />
      ))}
    </Tabs>
  );
}
