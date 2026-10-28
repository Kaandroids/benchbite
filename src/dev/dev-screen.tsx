import { Redirect, router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, listDivider } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useIsAccount } from '@/providers/session-provider';
import { useTheme } from '@/theme';

import { DevAccountLink } from './dev-account-link';

/** The tools, one row each. Text here is for developers only, so it is not translated. */
const TOOLS: { icon: IconName; title: string; detail: string; href: Href }[] = [
  {
    icon: 'layers',
    title: 'Component gallery',
    detail: 'Every component, the splash screen and resetting the onboarding',
    href: '/dev/components',
  },
];

/** Everything for development in one place, opened from beside the settings; only in development. */
export function DevScreen() {
  const { colors, spacing } = useTheme();
  const isAccount = useIsAccount();
  if (!__DEV__) {
    return <Redirect href="/" />;
  }
  return (
    <Screen onBack={() => router.back()} title="Developer tools">
      <Card list>
        {TOOLS.map((tool, index) => (
          <Pressable
            key={tool.title}
            accessibilityRole="button"
            accessibilityLabel={tool.title}
            accessibilityHint={tool.detail}
            onPress={() => router.push(tool.href)}
            style={({ pressed }) => [
              styles.row,
              { gap: spacing.md, paddingVertical: spacing.md, opacity: pressed ? 0.6 : 1 },
              listDivider(index === 0, colors.border),
            ]}
          >
            <IconTile name={tool.icon} size={40} />
            <View style={styles.text}>
              <Text variant="label">{tool.title}</Text>
              <Text variant="caption" color="textMuted">
                {tool.detail}
              </Text>
            </View>
            <Icon name="forward" color="textMuted" />
          </Pressable>
        ))}
      </Card>
      <DevAccountLink
        // Logging in warns about this; here it is said beside the link.
        note={isAccount ? undefined : 'This guest is signed out, and its data stays behind.'}
      />
      <Text variant="caption" color="textMuted">
        Supabase: {process.env.EXPO_PUBLIC_SUPABASE_URL}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    flex: 1,
  },
});
