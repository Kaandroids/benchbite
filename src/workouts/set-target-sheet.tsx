import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Sheet, SheetTitle } from '@/components/ui/sheet';
import { useNumberFormat } from '@/i18n/units';
import { minutesAndSeconds } from '@/lib/time';
import { SET_LIMITS } from '@/sets/fields';
import { useTheme } from '@/theme';

import type { SetTarget } from './set-targets';
import { StepperCard, stepperRow, type StepperRow } from './stepper-card';

const LIMITS = {
  reps: { min: 1, max: 100, step: 1 },
  seconds: { min: 5, max: 3600, step: 5 },
};

type SetTargetSheetProps = {
  /** The set's place, from 0. */
  index: number;
  target: SetTarget;
  /** Whether the set takes a weight, and how far it steps. */
  weight: { step: number } | null;
  onDone: (target: SetTarget) => void;
  onClose: () => void;
};

/** The target of one set of an exercise, changed in a sheet of its own over the exercise's. */
export function SetTargetSheet({ index, target, weight, onDone, onClose }: SetTargetSheetProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { format } = useNumberFormat();
  const [changed, setChanged] = useState(target);
  const set = (change: Partial<SetTarget>) => setChanged((current) => ({ ...current, ...change }));

  const rows: StepperRow[] = [];
  if (weight) {
    // No weight is below the first step, as for a set done with the body's weight alone.
    rows.push(
      stepperRow(
        t('editor.weight'),
        changed.weightKg ?? 0,
        { min: 0, max: SET_LIMITS.weightKg, step: weight.step },
        (next) => set({ weightKg: next === 0 ? null : next }),
        changed.weightKg === null ? '–' : `${format(changed.weightKg)} kg`,
      ),
    );
  }
  if (changed.seconds === null) {
    rows.push(
      stepperRow(t('editor.reps'), changed.reps ?? LIMITS.reps.min, LIMITS.reps, (reps) =>
        set({ reps }),
      ),
    );
  } else {
    rows.push(
      stepperRow(
        t('editor.time'),
        changed.seconds,
        LIMITS.seconds,
        (seconds) => set({ seconds }),
        minutesAndSeconds(changed.seconds),
      ),
    );
  }

  return (
    <Sheet onClose={onClose}>
      <SheetTitle>{t('editor.setTargetTitle', { number: index + 1 })}</SheetTitle>
      <StepperCard rows={rows} />
      <View style={[styles.actions, { gap: spacing.md }]}>
        <Button
          variant="ghost"
          label={t('editor.cancel')}
          onPress={onClose}
          style={styles.action}
        />
        <Button
          label={t('editor.done')}
          onPress={() => {
            onDone(changed);
            onClose();
          }}
          style={styles.action}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
  },
  action: {
    flex: 1,
  },
});
