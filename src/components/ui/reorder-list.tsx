import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useTheme } from '@/theme';

import { Icon } from './icon';

type ReorderListProps<T> = {
  items: T[];
  keyOf: (item: T) => string;
  /** The height of every row, which the drag distance is counted in. */
  rowHeight: number;
  onMove: (from: number, to: number) => void;
  renderItem: (item: T, index: number) => ReactNode;
  handleLabel: string;
};

/**
 * Rows that are reordered by dragging the handle at their start. A row follows the finger and
 * drops where it is let go; the others slide into their new places.
 */
export function ReorderList<T>({
  items,
  keyOf,
  rowHeight,
  onMove,
  renderItem,
  handleLabel,
}: ReorderListProps<T>) {
  return (
    <View>
      {items.map((item, index) => (
        <ReorderRow
          key={keyOf(item)}
          index={index}
          count={items.length}
          rowHeight={rowHeight}
          onMove={onMove}
          handleLabel={handleLabel}
        >
          {renderItem(item, index)}
        </ReorderRow>
      ))}
    </View>
  );
}

type ReorderRowProps = {
  index: number;
  count: number;
  rowHeight: number;
  onMove: (from: number, to: number) => void;
  handleLabel: string;
  children: ReactNode;
};

function ReorderRow({ index, count, rowHeight, onMove, handleLabel, children }: ReorderRowProps) {
  const { colors, spacing } = useTheme();
  const offset = useSharedValue(0);
  const lifted = useSharedValue(0);

  const lift = () => void Haptics.selectionAsync();

  const pan = usePanGesture({
    onActivate: () => {
      'worklet';
      lifted.set(withTiming(1, { duration: 120 }));
      scheduleOnRN(lift);
    },
    onUpdate: (event) => {
      'worklet';
      offset.set(event.translationY);
    },
    onFinalize: () => {
      'worklet';
      const to = Math.min(count - 1, Math.max(0, index + Math.round(offset.get() / rowHeight)));
      offset.set(0);
      lifted.set(withTiming(0, { duration: 120 }));
      if (to !== index) {
        scheduleOnRN(onMove, index, to);
      }
    },
  });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.get() }, { scale: 1 + lifted.get() * 0.02 }],
    zIndex: lifted.get() > 0 ? 1 : 0,
    shadowOpacity: lifted.get() * 0.15,
  }));

  return (
    <Animated.View
      layout={LinearTransition.duration(180)}
      style={[
        styles.row,
        { height: rowHeight, gap: spacing.sm, backgroundColor: colors.surface },
        style,
      ]}
    >
      <GestureDetector gesture={pan}>
        <View accessible accessibilityLabel={handleLabel} style={styles.handle} hitSlop={8}>
          <Icon name="drag" size={20} color="textMuted" />
        </View>
      </GestureDetector>
      <View style={styles.content}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
  },
  handle: {
    width: 28,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
});
