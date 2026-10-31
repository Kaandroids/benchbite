import type { ReactNode } from 'react';

import { Card, CardDivider } from '@/components/ui/card';

import { DayTotals, type DayTotalsProps } from './day-totals';

type DaySummaryProps = {
  /** Across the top, such as the day it sums up and the way to another. */
  header: ReactNode;
  /** Null while the day loads, or before there are targets: the card holds its header only. */
  totals: DayTotalsProps | null;
};

/**
 * A day's summary: its header, then the calories left as a ring, and the protein, carbs and fat
 * eaten against their targets.
 */
export function DaySummary({ header, totals }: DaySummaryProps) {
  return (
    <Card>
      {header}
      {totals ? (
        <>
          <CardDivider />
          <DayTotals {...totals} />
        </>
      ) : null}
    </Card>
  );
}
