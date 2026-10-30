import * as Haptics from 'expo-haptics';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useTheme } from '@/theme';

import { Icon } from './icon';

/** Each row's place in the list, by key. */
type Places = Record<string, number>;

type ReorderListProps<T> = {
  items: T[];
  keyOf: (item: T) => string;
  /** The height of every row, which the drag distance is counted in. */
  rowHeight: number;
  onMove: (from: number, to: number) => void;
  renderItem: (item: T, index: number) => ReactNode;
  /** What screen readers call a row's handle, such as the exercise's name. */
  labelOf: (item: T) => string;
  /** Called when a drag starts and ends, for example to stop the page from scrolling meanwhile. */
  onDragChange?: (dragging: boolean) => void;
  /** Changes a row's look, such as its background or padding. */
  rowStyle?: (item: T) => StyleProp<ViewStyle>;
};

const SLIDE = { duration: 180 };

function placesOf(keys: string[]): Places {
  return Object.fromEntries(keys.map((key, index) => [key, index]));
}

/** The places after the row with the key moves to `to`, with the rows in between moving up or down. */
function moved(places: Places, key: string, to: number): Places {
  'worklet';
  const from = places[key] ?? to;
  const next: Places = {};
  for (const other in places) {
    const place = places[other] ?? 0;
    if (other === key) {
      next[other] = to;
    } else if (from < to && place > from && place <= to) {
      next[other] = place - 1;
    } else if (from > to && place >= to && place < from) {
      next[other] = place + 1;
    } else {
      next[other] = place;
    }
  }
  return next;
}

/**
 * Rows that are reordered by dragging the handle at their start. The dragged row follows the finger
 * and the others make room as it passes them. The new order is reported when the row is let go,
 * by which time every row is already where the new order puts it. Screen readers, which cannot
 * drag, move a row a place up or down with the handle's actions instead.
 */
export function ReorderList<T>({
  items,
  keyOf,
  rowHeight,
  onMove,
  renderItem,
  labelOf,
  onDragChange,
  rowStyle,
}: ReorderListProps<T>) {
  const { t } = useTranslation();
  const keys = items.map(keyOf);
  const places = useSharedValue(placesOf(keys));

  // Follows the order the parent passes: after a drop it is the same, after an add or remove it
  // is not.
  const order = keys.join('\n');
  useEffect(() => {
    places.set(placesOf(order.split('\n')));
  }, [order, places]);

  return (
    <View style={{ height: items.length * rowHeight }}>
      {items.map((item, index) => (
        <ReorderRow
          key={keys[index]}
          id={keys[index] ?? ''}
          index={index}
          count={items.length}
          places={places}
          rowHeight={rowHeight}
          onMove={onMove}
          onDragChange={onDragChange}
          label={labelOf(item)}
          style={rowStyle?.(item)}
          onStep={(to) => {
            onMove(index, to);
            AccessibilityInfo.announceForAccessibility(
              t('reorder.moved', { name: labelOf(item), place: to + 1, count: items.length }),
            );
          }}
        >
          {renderItem(item, index)}
        </ReorderRow>
      ))}
    </View>
  );
}

type ReorderRowProps = {
  id: string;
  index: number;
  count: number;
  places: SharedValue<Places>;
  rowHeight: number;
  onMove: (from: number, to: number) => void;
  onDragChange: ((dragging: boolean) => void) | undefined;
  label: string;
  style: StyleProp<ViewStyle>;
  /** Moves the row to the place, as a screen reader's action does. */
  onStep: (to: number) => void;
  children: ReactNode;
};

function ReorderRow({
  id,
  index,
  count,
  places,
  rowHeight,
  onMove,
  onDragChange,
  label,
  style: rowStyle,
  onStep,
  children,
}: ReorderRowProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const top = useSharedValue(index * rowHeight);
  const dragging = useSharedValue(false);
  const startTop = useSharedValue(0);
  const startPlace = useSharedValue(0);
  const lifted = useSharedValue(0);

  // Slides to its place whenever the order changes, unless it is the row being dragged.
  useAnimatedReaction(
    () => places.get()[id],
    (place, previous) => {
      if (place !== undefined && place !== previous && !dragging.get()) {
        top.set(withTiming(place * rowHeight, SLIDE));
      }
    },
  );

  const lift = () => void Haptics.selectionAsync();
  const dragChanged = (value: boolean) => onDragChange?.(value);

  const pan = usePanGesture({
    // Takes the touch at once, before the page can start scrolling.
    minDistance: 0,
    onActivate: () => {
      'worklet';
      dragging.set(true);
      startTop.set(top.get());
      startPlace.set(places.get()[id] ?? index);
      lifted.set(withTiming(1, { duration: 120 }));
      scheduleOnRN(lift);
      scheduleOnRN(dragChanged, true);
    },
    onUpdate: (event) => {
      'worklet';
      top.set(startTop.get() + event.translationY);
      const place = Math.min(count - 1, Math.max(0, Math.round(top.get() / rowHeight)));
      if (place !== places.get()[id]) {
        places.set(moved(places.get(), id, place));
      }
    },
    onFinalize: () => {
      'worklet';
      if (!dragging.get()) {
        return;
      }
      dragging.set(false);
      const place = places.get()[id] ?? startPlace.get();
      top.set(withTiming(place * rowHeight, SLIDE));
      lifted.set(withTiming(0, { duration: 120 }));
      scheduleOnRN(dragChanged, false);
      if (place !== startPlace.get()) {
        scheduleOnRN(onMove, startPlace.get(), place);
      }
    },
  });

  const style = useAnimatedStyle(() => ({
    top: top.get(),
    transform: [{ scale: 1 + lifted.get() * 0.02 }],
    zIndex: dragging.get() ? 1 : 0,
    shadowOpacity: lifted.get() * 0.15,
  }));

  const actions = [
    ...(index > 0 ? [{ name: 'moveUp', label: t('reorder.moveUp') }] : []),
    ...(index < count - 1 ? [{ name: 'moveDown', label: t('reorder.moveDown') }] : []),
  ];
  const act = ({ nativeEvent }: AccessibilityActionEvent) =>
    onStep(nativeEvent.actionName === 'moveUp' ? index - 1 : index + 1);

  return (
    <Animated.View
      style={[
        styles.row,
        { height: rowHeight, gap: spacing.sm, backgroundColor: colors.surface },
        rowStyle,
        style,
      ]}
    >
      <GestureDetector gesture={pan}>
        <View
          accessible
          accessibilityLabel={label}
          accessibilityValue={{ text: t('reorder.place', { place: index + 1, count }) }}
          accessibilityHint={t('reorder.hint')}
          accessibilityActions={actions}
          onAccessibilityAction={act}
          style={styles.handle}
          hitSlop={8}
        >
          <Icon name="drag" size={20} color="textMuted" />
        </View>
      </GestureDetector>
      <View style={styles.content}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
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
