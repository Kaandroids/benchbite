import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, type TextInputInstance } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme';

import type { SetKind } from './fields';
import type { SessionSet, SetValues } from './session';
import { SetLine, setButtonStyle } from './set-table';

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
}: SetRowProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const running = clock !== null;
  const weightInput = useRef<TextInputInstance>(null);
  // A set of an exercise that records weight is not done without one (#34).
  const [missing, setMissing] = useState(false);
  const needsWeight = kind.fields.includes('weightKg') && !kind.addedWeight;
  const toggle = () => {
    if (!set.done && needsWeight && set.weightKg === null) {
      setMissing(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      weightInput.current?.focus();
      return;
    }
    onToggle();
  };
  // A timed set is done with its clock, or with a tick once its time is typed by hand.
  const clockButton = kind.timed && !set.done && (running || set.seconds === null);

  return (
    <SetLine
      number={number}
      kind={kind}
      values={set}
      showLast
      last={last}
      done={set.done}
      clock={clock}
      invalid={missing && set.weightKg === null ? ['weightKg'] : []}
      weightRef={weightInput}
      onChange={onChange}
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
