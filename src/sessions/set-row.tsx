import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View, type TextInputInstance } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { SetField, SetKind } from '@/sets/fields';
import type { RecordKind } from '@/sets/records';
import { useRecordFormat } from '@/sets/records';
import { SetLine, setButtonStyle } from '@/sets/set-table';
import type { SetValues } from '@/sets/values';
import { useTheme } from '@/theme';

import { recordValues } from './records';
import type { SessionSet } from './session';

type SetRowProps = {
  number: number;
  set: SessionSet;
  kind: SetKind;
  last: SetValues | undefined;
  /** The seconds the set's clock shows while it runs; null when it is not running. */
  clock: number | null;
  onChange: (values: Partial<SetValues>) => void;
  onToggle: () => void;
  onClock: () => void;
  /** The kinds of record the set beat everything before it in. */
  records?: readonly RecordKind[];
};

/** One set while logging: last time's values, the values to log and the button that logs it. */
export function SetRow({
  number,
  set,
  kind,
  last,
  clock,
  onChange,
  onToggle,
  onClock,
  records = [],
}: SetRowProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const formatRecord = useRecordFormat();
  const running = clock !== null;
  const weightInput = useRef<TextInputInstance>(null);
  // A set is not done without what it needs: a weight where the exercise records one (#34), and
  // reps where it records reps, which the log would refuse without them.
  const [checked, setChecked] = useState(false);
  const missing: SetField[] = [
    ...(kind.fields.includes('weightKg') && !kind.addedWeight && set.weightKg === null
      ? (['weightKg'] as const)
      : []),
    ...(kind.fields.includes('reps') && set.reps === null ? (['reps'] as const) : []),
  ];
  const toggle = () => {
    if (!set.done && missing.length > 0) {
      setChecked(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      if (missing.includes('weightKg')) {
        weightInput.current?.focus();
      }
      return;
    }
    onToggle();
  };
  // A timed set is done with its clock, or with a tick once its time is typed by hand.
  const clockButton = kind.timed && !set.done && (running || set.seconds === null);
  // One record names its value; several only their kinds, the set's values being beside them.
  const [firstRecord] = records;
  const values = recordValues(set, kind);
  const recordText = !firstRecord
    ? null
    : records.length === 1
      ? t('session.newRecord', {
          kind: t(`exerciseHistory.kinds.${firstRecord}`),
          value: formatRecord({
            kind: firstRecord,
            value: values[firstRecord as Exclude<RecordKind, 'most_time'>] ?? 0,
            set,
          }),
        })
      : t('session.newRecords', {
          kinds: records.map((record) => t(`exerciseHistory.kinds.${record}`)).join(', '),
        });

  return (
    <SetLine
      number={number}
      kind={kind}
      values={set}
      showLast
      last={last}
      done={set.done}
      clock={clock}
      invalid={checked ? missing : []}
      weightRef={weightInput}
      onChange={onChange}
      note={
        recordText ? (
          <View style={[styles.record, { gap: spacing.xs }]}>
            <Icon name="trophy" size={14} color="primaryText" />
            <Text variant="captionStrong" color="primaryText">
              {recordText}
            </Text>
          </View>
        ) : null
      }
      button={
        clockButton ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              running ? t('session.stopClock', { number }) : t('session.startClock', { number })
            }
            onPress={onClock}
            style={[
              setButtonStyle,
              { backgroundColor: running ? colors.primaryButton : colors.iconBackground },
            ]}
          >
            <Icon
              name={running ? 'stop' : 'play'}
              size={16}
              color={running ? 'onPrimary' : 'primaryText'}
            />
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: set.done }}
            accessibilityLabel={t('session.done', { number })}
            onPress={toggle}
            style={[
              setButtonStyle,
              set.done
                ? { backgroundColor: colors.primaryButton }
                : { borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            <Icon name="check" size={16} color={set.done ? 'onPrimary' : 'border'} />
          </Pressable>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  record: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
