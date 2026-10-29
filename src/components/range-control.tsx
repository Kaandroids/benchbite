import { useTranslation } from 'react-i18next';

import { SegmentedControl } from '@/components/ui/segmented-control';
import { PROGRESS_RANGES, type ProgressRange } from '@/lib/ranges';

type RangeControlProps = {
  value: ProgressRange;
  onChange: (range: ProgressRange) => void;
  /** What the range is of, for screen readers. */
  accessibilityLabel: string;
  /** The ranges to choose from, every one by default. */
  ranges?: readonly ProgressRange[];
};

/** The ranges a chart of the Progress tab can show, a month to a year. */
export function RangeControl({
  value,
  onChange,
  accessibilityLabel,
  ranges = PROGRESS_RANGES,
}: RangeControlProps) {
  const { t } = useTranslation();
  return (
    <SegmentedControl
      options={ranges.map((range) => ({
        value: range,
        label: t(`progress.range.${range}`),
      }))}
      value={value}
      onChange={onChange}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
