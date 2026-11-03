import { View } from 'react-native';

import { Caption } from '@/components/ui/caption';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import { isDbError } from '@/lib/errors';
import { TRIAL_DAYS } from '@/premium/trial';
import { useIsAccount } from '@/providers/session-provider';
import { useTheme } from '@/theme';

import { canUseDevTools } from './dev-account';
import { PLANS, useDevPlan, useSetDevPlan, type Plan } from './dev-plan';

const LABELS: Record<Plan, string> = { free: 'Free', trial: 'Trial', premium: 'Premium' };

/**
 * Switches the signed-in account between the free plan, the trial and premium (ADR 0080); only in
 * development against the local database, which must have the developer tools on in its Vault.
 * The text is for developers, so it is not translated.
 */
export function DevPlanSection() {
  const isAccount = useIsAccount();
  if (!canUseDevTools() || !isAccount) {
    return null;
  }
  return <PlanSwitcher />;
}

function PlanSwitcher() {
  const { spacing } = useTheme();
  const plan = useDevPlan();
  const setPlan = useSetDevPlan();
  // The plan being switched to while it is saved, so the control follows the tap.
  const shown = setPlan.isPending ? setPlan.variables : plan.data;
  const error = setPlan.error ?? plan.error;
  return (
    <View style={{ gap: spacing.sm }}>
      <Caption accessibilityRole="header">Plan</Caption>
      {shown ? (
        <SegmentedControl
          accessibilityLabel="Plan"
          options={PLANS.map((value) => ({ value, label: LABELS[value] }))}
          value={shown}
          onChange={(value) => {
            if (!setPlan.isPending) {
              setPlan.mutate(value);
            }
          }}
        />
      ) : null}
      <Text variant="caption" color={error ? 'danger' : 'textMuted'}>
        {error
          ? isDbError(error, 'devToolsOff')
            ? 'The developer tools are off on this database. Run pnpm vault:local to turn them on.'
            : error.message
          : shown
            ? `The trial lasts ${TRIAL_DAYS} days and premium a month, from the switch.`
            : 'Loading the plan…'}
      </Text>
    </View>
  );
}
