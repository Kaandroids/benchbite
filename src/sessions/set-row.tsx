import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { fonts, typography, useTheme } from '@/theme';
import { minutesAndSeconds } from '@/workouts/format';

import { describeSet, parseTime, type SetField, type SetKind } from './fields';
import type { SessionSet, SetValues } from './session';

/** The widths of a set's columns: its number, last time, the fields and the button. */
export const NUMBER_WIDTH = 30;
export const BUTTON_SIZE = 36;

export function fieldWidth(kind: SetKind) {
  return kind.fields.length === 1 ? 96 : 68;
}

function show(field: SetField, value: number | null): string {
  if (value === null) {
    return '';
  }
  return field === 'seconds' ? minutesAndSeconds(value) : String(value);
}

function read(field: SetField, text: string): number | null {
  if (field === 'seconds') {
    return parseTime(text);
  }
  const value = Number(text.replace(',', '.'));
  if (!text.trim() || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return field === 'weightKg' ? Math.round(value * 4) / 4 : Math.round(value);
}

type SetInputProps = {
  field: SetField;
  value: number | null;
  label: string;
  placeholder?: string;
  done: boolean;
  /** The seconds a running clock shows instead of the value. */
  clock: number | null;
  onChange: (value: number | null) => void;
};

function SetInput({ field, value, label, placeholder, done, clock, onChange }: SetInputProps) {
  const { colors, radii } = useTheme();
  // Typed text is kept until editing ends, so that "1:" or "2." can be typed on the way.
  const [text, setText] = useState<string | null>(null);
  const running = clock !== null;
  return (
    <TextInput
      accessibilityLabel={label}
      value={running ? minutesAndSeconds(clock) : (text ?? show(field, value))}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      editable={!running}
      keyboardType={
        field === 'weightKg'
          ? 'decimal-pad'
          : field === 'seconds'
            ? 'numbers-and-punctuation'
            : 'number-pad'
      }
      selectTextOnFocus
      onChangeText={setText}
      onEndEditing={() => {
        if (text !== null) {
          onChange(read(field, text));
          setText(null);
        }
      }}
      style={[
        styles.input,
        typography.bodyStrong,
        { borderRadius: radii.md },
        running
          ? {
              borderWidth: 1.5,
              borderColor: colors.primaryButton,
              backgroundColor: colors.selected,
              color: colors.primaryText,
            }
          : done
            ? { borderWidth: 0, backgroundColor: 'transparent', color: colors.text }
            : {
                borderWidth: 1.5,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                color: colors.textMuted,
              },
      ]}
    />
  );
}

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
};

/** One set: last time's values, the values to log and the button that logs it. */
export function SetRow({
  number,
  set,
  kind,
  last,
  clock,
  onChange,
  onToggle,
  onClock,
}: SetRowProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const running = clock !== null;
  const width = fieldWidth(kind);
  const labels: Record<SetField, string> = {
    weightKg: t('session.weightOf', { number }),
    reps: t('session.repsOf', { number }),
    seconds: t('session.timeOf', { number }),
    meters: t('session.metersOf', { number }),
  };

  return (
    <View
      style={[
        styles.row,
        {
          gap: spacing.sm,
          borderRadius: radii.md,
          backgroundColor: set.done ? colors.selected : 'transparent',
        },
      ]}
    >
      <Text variant="bodyStrong" align="center" style={[styles.bold, { width: NUMBER_WIDTH }]}>
        {number}
      </Text>
      <Text variant="caption" color="textMuted" numberOfLines={1} style={styles.last}>
        {last ? describeSet(last, kind) : '—'}
      </Text>
      {kind.fields.map((field) => (
        <View key={field} style={{ width }}>
          <SetInput
            field={field}
            value={set[field]}
            label={labels[field]}
            placeholder={
              field === 'weightKg' && kind.addedWeight ? t('session.optional') : undefined
            }
            done={set.done}
            clock={field === 'seconds' && running ? clock : null}
            onChange={(value) => onChange({ [field]: value })}
          />
        </View>
      ))}
      {kind.timed && !set.done ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            running ? t('session.stopClock', { number }) : t('session.startClock', { number })
          }
          onPress={onClock}
          style={[
            styles.button,
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
          onPress={onToggle}
          style={[
            styles.button,
            set.done
              ? { backgroundColor: colors.primaryButton }
              : { borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
          ]}
        >
          <Icon name="check" size={16} color={set.done ? 'onPrimary' : 'border'} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  bold: {
    fontFamily: fonts.extraBold,
  },
  last: {
    flex: 1,
  },
  input: {
    height: 40,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
