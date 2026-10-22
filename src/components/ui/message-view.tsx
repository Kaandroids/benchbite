import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { useTheme } from '@/theme';

import type { IconName } from './icon';
import { IconTile } from './icon-tile';
import { Text } from './text';

type MessageViewProps = {
  icon: IconName;
  title: string;
  message: string;
};

/**
 * A large icon with a title and a short message in the middle of the screen, for screens that
 * explain rather than ask, such as an error or an interlude.
 */
export function MessageView({ icon, title, message }: MessageViewProps) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.content, { gap: spacing.lg }]}>
      <Animated.View entering={ZoomIn.duration(400)}>
        <IconTile name={icon} size={88} />
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(150).duration(400)} style={{ gap: spacing.md }}>
        <Text variant="title" align="center">
          {title}
        </Text>
        <Text color="textMuted" align="center">
          {message}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
