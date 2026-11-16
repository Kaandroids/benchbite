import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { SetValues } from './values';
import { describeSet, type SetKind, type SetWords } from './fields';

/**
 * A set's numbers in the app's language, as "77,5" in German, without grouping, as a set holds at
 * most a quarter kilogram; and a number of reps on their own, as "8 reps".
 */
export function useSetWords(): SetWords {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  return useMemo(() => {
    const format = new Intl.NumberFormat(language, {
      maximumFractionDigits: 2,
      useGrouping: false,
    });
    return {
      number: (value) => format.format(value),
      reps: (count) => t('sets.reps', { count }),
    };
  }, [t, language]);
}

/** Describes a set in the app's language (describeSet()), the same while the language stays. */
export function useDescribeSet(): (values: SetValues, kind: SetKind) => string {
  const words = useSetWords();
  return useMemo(() => (values, kind) => describeSet(values, kind, words), [words]);
}
