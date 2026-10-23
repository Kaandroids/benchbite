import { useState, type ReactNode, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';

import { Text } from '@/components/ui/text';
import { fonts, typography, useTheme } from '@/theme';
import { minutesAndSeconds } from '@/workouts/format';

import { describeSet, parseTime, SET_LIMITS, type SetField, type SetKind } from './fields';
import { MAX_SETS, type SetValues } from './session';

// The table of an exercise's sets, while logging a workout and when editing a finished one: a
// header, a line for each set and a button that adds one.

/** The widths of a set's columns: its number and the button at its end. */
const NUMBER_WIDTH = 30;
export const SET_BUTTON_SIZE = 36;

/** Fields beside last time's values have a fixed width; without them they share the line. */
function fieldStyle(kind: SetKind, showLast: boolean) {
  return showLast ? { width: kind.fields.length === 1 ? 96 : 68 } : styles.flex;
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
  // Beyond what a set can hold, the value is the most it can be, so that the workout still saves.
  const rounded = field === 'weightKg' ? Math.round(value * 4) / 4 : Math.round(value);
  return Math.min(rounded, SET_LIMITS[field]);
}

// The characters a value needs at most, such as "999.75", "999", "1440:00" or "1000000".
const MAX_LENGTH: Record<SetField, number> = { weightKg: 6, reps: 3, seconds: 7, meters: 7 };

type SetHeaderProps = {
  kind: SetKind;
  /** Leaves room for last time's values. */
  showLast: boolean;
};

/** The titles of a set's columns. */
export function SetHeader({ kind, showLast }: SetHeaderProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const columns = kind.fields.map((field) =>
    field === 'weightKg'
      ? kind.addedWeight
        ? t('session.columns.addedKg')
        : t('session.columns.kg')
      : t(`session.columns.${field}`),
  );
  return (
    <View style={[styles.row, { gap: spacing.sm, paddingHorizontal: 2 }]}>
      <Text
        variant="caption"
        color="textMuted"
        align="center"
        style={[styles.bold, { width: NUMBER_WIDTH }]}
      >
        {t('session.columns.set')}
      </Text>
      {showLast ? (
        <Text variant="caption" color="textMuted" style={[styles.bold, styles.flex]}>
          {t('session.columns.last')}
        </Text>
      ) : null}
      {columns.map((column) => (
        <Text
          key={column}
          variant="caption"
          color="textMuted"
          align="center"
          style={[styles.bold, fieldStyle(kind, showLast)]}
        >
          {column}
        </Text>
      ))}
      <View style={{ width: SET_BUTTON_SIZE }} />
    </View>
  );
}

type SetInputProps = {
  field: SetField;
  value: number | null;
  label: string;
  placeholder?: string;
  done: boolean;
  /** The seconds a running clock shows instead of the value. */
  clock: number | null;
  /** Marks a value that is needed before the set can be done. */
  invalid: boolean;
  /** Shows the value faint, as a suggestion, until the set is done. */
  muted: boolean;
  onChange: (value: number | null) => void;
  ref?: Ref<TextInputInstance>;
};

/** A value of a set, typed as a weight, a number, a time such as "1:30" or a distance. */
function SetInput({
  field,
  value,
  label,
  placeholder,
  done,
  clock,
  invalid,
  muted,
  onChange,
  ref,
}: SetInputProps) {
  const { colors, radii } = useTheme();
  // Typed text is shown until editing ends, so that "1:" or "2." can be typed on the way.
  const [text, setText] = useState<string | null>(null);
  const running = clock !== null;
  return (
    <TextInput
      ref={ref}
      accessibilityLabel={label}
      accessibilityState={{ disabled: running }}
      aria-invalid={invalid}
      value={running ? minutesAndSeconds(clock) : (text ?? show(field, value))}
      placeholder={placeholder}
      placeholderTextColor={colors.placeholder}
      editable={!running}
      keyboardType={
        field === 'weightKg'
          ? 'decimal-pad'
          : field === 'seconds'
            ? 'numbers-and-punctuation'
            : 'number-pad'
      }
      selectTextOnFocus
      maxLength={MAX_LENGTH[field]}
      onChangeText={(typed) => {
        setText(typed);
        // Saved as soon as it reads as a value or is cleared, so that the set can be ticked or
        // saved while the keyboard is still up; "1:" or "2." wait until editing ends.
        const value = read(field, typed);
        if (value !== null || typed.trim() === '') {
          onChange(value);
        }
      }}
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
                borderWidth: invalid ? 2 : 1.5,
                borderColor: invalid ? colors.danger : colors.border,
                backgroundColor: colors.surface,
                color: muted ? colors.textMuted : colors.text,
              },
      ]}
    />
  );
}

type SetLineProps = {
  number: number;
  kind: SetKind;
  values: SetValues;
  /** Shows last time's values, or a dash when there were none. */
  showLast?: boolean;
  last?: SetValues;
  done?: boolean;
  /** The seconds the set's clock shows while it runs; null when it is not running. */
  clock?: number | null;
  /** Fields that are marked as needed. */
  invalid?: readonly SetField[];
  /** Shows the values faint, as suggestions, until the set is done. */
  muted?: boolean;
  weightRef?: Ref<TextInputInstance>;
  onChange: (values: Partial<SetValues>) => void;
  /** The button at the end of the line, such as the tick that logs the set. */
  button: ReactNode;
  /** A line under the set, such as the records it set. */
  note?: ReactNode;
};

/** One set: its number, last time's values when shown, its fields and a button. */
export function SetLine({
  number,
  kind,
  values,
  showLast = false,
  last,
  done = false,
  clock = null,
  invalid = [],
  muted = true,
  weightRef,
  onChange,
  button,
  note,
}: SetLineProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const labels: Record<SetField, string> = {
    weightKg: t('session.weightOf', { number }),
    reps: t('session.repsOf', { number }),
    seconds: t('session.timeOf', { number }),
    meters: t('session.metersOf', { number }),
  };
  return (
    <View
      style={[
        styles.line,
        {
          gap: spacing.xs,
          borderRadius: radii.md,
          backgroundColor: done ? colors.selected : 'transparent',
        },
      ]}
    >
      <View style={[styles.row, { gap: spacing.sm }]}>
        <Text variant="bodyStrong" align="center" style={[styles.bold, { width: NUMBER_WIDTH }]}>
          {number}
        </Text>
        {showLast ? (
          <Text variant="caption" color="textMuted" numberOfLines={1} style={styles.flex}>
            {last ? describeSet(last, kind) : '—'}
          </Text>
        ) : null}
        {kind.fields.map((field) => (
          <View key={field} style={fieldStyle(kind, showLast)}>
            <SetInput
              field={field}
              value={values[field]}
              label={labels[field]}
              // Added weight is optional, and a time is measured from zero; short hints fit the field.
              placeholder={
                field === 'weightKg' && kind.addedWeight
                  ? '0'
                  : field === 'seconds'
                    ? minutesAndSeconds(0)
                    : undefined
              }
              done={done}
              clock={field === 'seconds' ? clock : null}
              invalid={invalid.includes(field)}
              muted={muted}
              ref={field === 'weightKg' ? weightRef : undefined}
              onChange={(value) => onChange({ [field]: value })}
            />
          </View>
        ))}
        {button}
      </View>
      {note ? <View style={{ paddingLeft: NUMBER_WIDTH + spacing.sm }}>{note}</View> : null}
    </View>
  );
}

/** Adds a set to an exercise, until it has as many as a log can keep. */
export function AddSetButton({ count, onPress }: { count: number; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors, radii } = useTheme();
  if (count >= MAX_SETS) {
    return null;
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.addSet, { borderRadius: radii.md, backgroundColor: colors.background }]}
    >
      <Text variant="bodyStrong" color="primaryText" style={styles.bold}>
        {t('session.addSet')}
      </Text>
    </Pressable>
  );
}

/** The round button at the end of a set's line. */
export const setButtonStyle = {
  width: SET_BUTTON_SIZE,
  height: SET_BUTTON_SIZE,
  borderRadius: SET_BUTTON_SIZE / 2,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  bold: {
    fontFamily: fonts.extraBold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  line: {
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  input: {
    height: 40,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  addSet: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
