import { Text } from '@/components/ui/text';
import { fireEvent, render, screen } from '@/test/render';

import { PlanRow } from './plan-row';

describe('PlanRow', () => {
  it('shows its texts and draws its round button, which does its action', async () => {
    const onAction = jest.fn();
    await render(
      <PlanRow
        icon="missed"
        color="snack"
        background="snackBackground"
        caption="Missed on Monday"
        title="Push"
        actionIcon="redo"
        actionLabel="Catch up"
        onAction={onAction}
      >
        <Text>1 exercise · about 45 min</Text>
      </PlanRow>,
    );
    expect(screen.getByText('Missed on Monday')).toBeTruthy();
    expect(screen.getByText('Push')).toBeTruthy();
    expect(screen.getByText('1 exercise · about 45 min')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Catch up' }));
    expect(onAction).toHaveBeenCalled();
  });
});
