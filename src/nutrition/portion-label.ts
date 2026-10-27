import { useTranslation } from 'react-i18next';

import { useNumberFormat } from '@/i18n/units';

import type { PortionUnit } from './foods';

/** Names a number of portions in the app language, such as "2 slices" or "1.5 cups". */
export function usePortionLabel() {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  return (unit: PortionUnit, count: number) =>
    t(`nutrition.units.${unit}`, { count, amount: format(count) });
}
