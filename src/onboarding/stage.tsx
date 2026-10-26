import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

/**
 * A tinted stage for a picture of the app, filling the space it is given. The picture shrinks to
 * fit it, so the words under the stage stay in place on a small screen or with a large font.
 */
type StageProps = {
  children: ReactNode;
  /**
   * On a screen that scrolls, the least height the stage keeps, so that long words below it make
   * the screen scroll rather than squeeze the picture away.
   */
  minHeight?: number;
};

export function Stage({ children, minHeight }: StageProps) {
  const { colors, radii, spacing } = useTheme();
  return (
    <View
      style={[
        styles.stage,
        {
          borderRadius: radii.xl,
          backgroundColor: colors.primaryWash,
          padding: spacing.lg,
          minHeight,
        },
      ]}
    >
      <FitInside>{children}</FitInside>
    </View>
  );
}

/** Shrinks its content to fit the space it is given, never growing it. */
function FitInside({ children }: { children: ReactNode }) {
  const [space, setSpace] = useState(0);
  const [content, setContent] = useState(0);
  const scale = space > 0 && content > space ? space / content : 1;
  return (
    <View onLayout={(event) => setSpace(event.nativeEvent.layout.height)} style={styles.fit}>
      <View
        onLayout={(event) => setContent(event.nativeEvent.layout.height)}
        style={{ transform: [{ scale }] }}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    overflow: 'hidden',
  },
  fit: {
    flex: 1,
    justifyContent: 'center',
  },
});
