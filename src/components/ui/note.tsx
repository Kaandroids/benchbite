import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Icon, type IconName } from './icon';
import { Text } from './text';

type Tone = 'info' | 'warning' | 'danger';

const TONES: Record<
  Tone,
  { icon: IconName; background: 'infoBackground' | 'warningBackground' | 'dangerBackground' }
> = {
  info: { icon: 'info', background: 'infoBackground' },
  warning: { icon: 'warning', background: 'warningBackground' },
  danger: { icon: 'error', background: 'dangerBackground' },
};

/**
 * A message in a tinted box: something to know, such as that a plan is no medical advice, a
 * warning before an action, or an error that is not about one field. With a title, the message
 * reads as its body.
 */
export function Note({ tone, title, children }: { tone: Tone; title?: string; children: string }) {
  const { colors, radii, spacing } = useTheme();
  const { icon, background } = TONES[tone];
  return (
    <View
      accessible
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      style={[
        styles.note,
        {
          backgroundColor: colors[background],
          borderRadius: radii.md,
          padding: spacing.md,
          gap: spacing.sm,
        },
      ]}
    >
      <Icon name={icon} size={20} color={tone} />
      <View style={[styles.flex, { gap: spacing.xs }]}>
        {title ? <Text variant="bodyStrong">{title}</Text> : null}
        <Text variant={title ? 'body' : 'bodyStrong'}>{children}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  flex: {
    flex: 1,
  },
});
