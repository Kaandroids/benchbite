import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { WheelPicker } from '@/components/ui/wheel-picker';
import { useTheme } from '@/theme';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

type EndSheetProps = {
  /** The end shown first, and the earliest and latest it can be, all as times in milliseconds. */
  value: number;
  earliest: number;
  latest: number;
  /** The time of the last done set, named as the earliest end. */
  lastSet: string;
  onDone: (end: number) => void;
  onClose: () => void;
};

/** The minutes of an hour that lie between the earliest and the latest end. */
function minutesOf(hour: number, earliest: number, latest: number): number[] {
  return Array.from({ length: 60 }, (_, minute) => minute).filter((minute) => {
    const time = hour + minute * MINUTE;
    return time >= earliest && time <= latest;
  });
}

/** The start of the hour a time is in, on the device's clock. */
function hourOf(time: number): number {
  const date = new Date(time);
  date.setMinutes(0, 0, 0);
  return date.getTime();
}

/** A time to the minute, as the wheels show it. */
const toMinute = (time: number) => Math.floor(time / MINUTE) * MINUTE;

/** Asks when a workout really ended, between its last set and now, by hour and minute. */
export function EndSheet({ value, earliest, latest, lastSet, onDone, onClose }: EndSheetProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  // To the minute, so that a last set and a now within the same minute still leave that minute.
  const from = toMinute(earliest);
  const to = Math.max(from, toMinute(latest));
  const [end, setEnd] = useState(() => Math.min(Math.max(toMinute(value), from), to));

  const hours: number[] = [];
  for (let hour = hourOf(from); hour <= to; hour += HOUR) {
    hours.push(hour);
  }
  const hour = hourOf(end);
  const minutes = minutesOf(hour, from, to);
  const minute = new Date(end).getMinutes();
  const two = (number: number) => String(number).padStart(2, '0');

  // A new hour keeps the minute where it can, and else takes the nearest one of that hour.
  const chooseHour = (next: number) => {
    const allowed = minutesOf(next, from, to);
    const kept = allowed.includes(minute)
      ? minute
      : allowed.reduce(
          (best, candidate) =>
            Math.abs(candidate - minute) < Math.abs(best - minute) ? candidate : best,
          allowed[0] ?? 0,
        );
    setEnd(next + kept * MINUTE);
  };

  return (
    <Sheet onClose={onClose}>
      <Text variant="headline" accessibilityRole="header">
        {t('session.end.title')}
      </Text>
      <View style={[styles.wheels, { gap: spacing.sm }]}>
        <WheelPicker
          values={hours}
          value={hour}
          onChange={chooseHour}
          format={(time) => two(new Date(time).getHours())}
          accessibilityLabel={t('session.end.hour')}
          width={88}
        />
        <Text variant="headline">:</Text>
        <WheelPicker
          values={minutes}
          value={minute}
          onChange={(next) => setEnd(hour + next * MINUTE)}
          format={two}
          accessibilityLabel={t('session.end.minute')}
          width={88}
        />
      </View>
      <Text variant="caption" color="textMuted" align="center">
        {t('session.end.range', { time: lastSet })}
      </Text>
      <Button label={t('session.end.done')} onPress={() => onDone(end)} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wheels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
