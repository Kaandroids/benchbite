// The app's copies of the database's rules, checked against the cases the database's own pgTAP
// test checks too (supabase/tests/rules/cases.json, #546): a change to one side alone fails.
import { oneRepMax, recordValues } from '@/sessions/records';
import type { LibraryExercise } from '@/exercises/library';

import cases from '../../supabase/tests/rules/cases.json';
import { setKindOf, weightStepOf } from './fields';

describe('one_rep_max()', () => {
  it.each(cases.oneRepMax)('estimates $weightKg kg × $reps as $expected', (item) => {
    expect(oneRepMax(item.weightKg, item.reps)).toBe(item.expected);
  });
});

describe('record_candidates()', () => {
  it.each(cases.recordValues)('$name', (item) => {
    const metrics = item.metrics as LibraryExercise['metrics'];
    const kind = setKindOf(metrics, { seconds: null, meters: null });
    expect(recordValues(item.set, kind)).toEqual(item.expected);
  });
});

describe('weight_step()', () => {
  it.each(cases.weightStep)('steps $equipment by $expected', (item) => {
    const equipment = (item.equipment ?? undefined) as LibraryExercise['equipment'] | undefined;
    expect(weightStepOf(equipment)).toBe(item.expected);
  });
});
