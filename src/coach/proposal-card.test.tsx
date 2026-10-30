import type { ProposalCard as Card } from '@shared/coach/chat';

import { supabase } from '@/lib/supabase';
import { act, fireEvent, render, screen, waitFor } from '@/test/render';

import { ProposalCard } from './proposal-card';
import { type ProposalState, useProposalStates } from './proposals';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

const WORKOUT: Card = {
  kind: 'workout',
  id: 7,
  workout: { name: 'Lower body', type: null },
  swaps: [
    {
      from: 'Back squat',
      to: 'Leg press',
      sets: 3,
      target: { reps: { min: 10, max: 12 } },
      why: 'easier on the knee',
    },
  ],
};
const TARGETS: Card = {
  kind: 'targets',
  id: 8,
  from: { calories: 2250, proteinG: 140, carbsG: 220, fatG: 70 },
  to: { calories: 2100, proteinG: 150, carbsG: 220, fatG: 70 },
};
const pending: ProposalState = { status: 'pending', expired: false };

/** Lets decide_coach_proposal() answer with `status`, or refuse with `code`. */
function decides(status: string | null, code?: string) {
  jest
    .mocked(supabase.rpc)
    .mockResolvedValue({ data: status, error: code ? { code } : null } as never);
}

beforeEach(() => jest.clearAllMocks());

it('shows the exercises a workout change swaps, from today', async () => {
  await render(<ProposalCard card={WORKOUT} state={pending} />);

  expect(screen.getByText('Lower body')).toBeOnTheScreen();
  expect(screen.getByText('From today')).toBeOnTheScreen();
  expect(
    screen.getByLabelText('Leg press instead of Back squat, 3 × 10–12 reps · easier on the knee'),
  ).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Apply' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Keep as is' })).toBeOnTheScreen();
});

it('names a workout without a name by its type', async () => {
  await render(
    <ProposalCard card={{ ...WORKOUT, workout: { name: null, type: 'lower' } }} state={pending} />,
  );

  expect(screen.getByRole('header')).toHaveTextContent('Lower body');
});

it('shows only the targets that change, from today', async () => {
  await render(<ProposalCard card={TARGETS} state={pending} />);

  expect(screen.getByText('Daily targets')).toBeOnTheScreen();
  expect(screen.getByText('From today')).toBeOnTheScreen();
  expect(screen.getByLabelText('Calories: 2,100 kcal instead of 2,250 kcal')).toBeOnTheScreen();
  expect(screen.getByLabelText('Protein: 150 g instead of 140 g')).toBeOnTheScreen();
  expect(screen.queryByText('Carbs')).not.toBeOnTheScreen();
  expect(screen.queryByText('Fat')).not.toBeOnTheScreen();
});

it('shows only the new targets when none were in use', async () => {
  await render(<ProposalCard card={{ ...TARGETS, from: null }} state={pending} />);

  expect(screen.getByLabelText('Calories: 2,100 kcal')).toBeOnTheScreen();
  expect(screen.getByLabelText('Fat: 70 g')).toBeOnTheScreen();
  expect(screen.queryByText('2,250 kcal')).not.toBeOnTheScreen();
});

it('applies a change and folds into a line with Undo, which undoes it', async () => {
  decides('applied');
  await render(<ProposalCard card={TARGETS} state={pending} />);

  await fireEvent.press(screen.getByRole('button', { name: 'Apply' }));

  expect(supabase.rpc).toHaveBeenCalledWith('decide_coach_proposal', {
    proposal_id: 8,
    decision: 'apply',
    today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  });
  // The states on the screen hold the new status; here it comes in as a new state.
  await screen.rerender(<ProposalCard card={TARGETS} state={{ ...pending, status: 'applied' }} />);
  expect(screen.getByText('Applied: 2,100 kcal and 150 g protein a day')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeOnTheScreen();

  decides('undone');
  await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
  expect(supabase.rpc).toHaveBeenLastCalledWith(
    'decide_coach_proposal',
    expect.objectContaining({ proposal_id: 8, decision: 'undo' }),
  );
  await screen.rerender(<ProposalCard card={TARGETS} state={{ ...pending, status: 'undone' }} />);
  expect(screen.getByText('Undone')).toBeOnTheScreen();
  expect(screen.queryByRole('button')).not.toBeOnTheScreen();
});

it('keeps things as they are', async () => {
  decides('kept');
  await render(<ProposalCard card={WORKOUT} state={pending} />);

  await fireEvent.press(screen.getByRole('button', { name: 'Keep as is' }));

  expect(supabase.rpc).toHaveBeenCalledWith(
    'decide_coach_proposal',
    expect.objectContaining({ proposal_id: 7, decision: 'keep' }),
  );
  await screen.rerender(<ProposalCard card={WORKOUT} state={{ ...pending, status: 'kept' }} />);
  expect(screen.getByText('Kept as it is')).toBeOnTheScreen();
});

it('sums up an applied workout change', async () => {
  await render(<ProposalCard card={WORKOUT} state={{ ...pending, status: 'applied' }} />);

  expect(screen.getByText('Applied: Leg press instead of Back squat')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Undo' })).toBeOnTheScreen();
});

it.each([
  ['BB035', 'This changed since — ask Bite again'],
  ['BB036', 'This is out of date'],
  ['BB037', 'This is now below the least we recommend — ask Bite again'],
])('says why a change refused with %s cannot be applied', async (code, line) => {
  decides(null, code);
  await render(<ProposalCard card={TARGETS} state={pending} />);

  await fireEvent.press(screen.getByRole('button', { name: 'Apply' }));

  expect(await screen.findByText(line)).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeOnTheScreen();
});

it('still lets a change that changed since be kept as it is', async () => {
  decides(null, 'BB035');
  await render(<ProposalCard card={TARGETS} state={pending} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Apply' }));
  await screen.findByText('This changed since — ask Bite again');

  decides('kept');
  await fireEvent.press(screen.getByRole('button', { name: 'Keep as is' }));

  expect(supabase.rpc).toHaveBeenLastCalledWith(
    'decide_coach_proposal',
    expect.objectContaining({ proposal_id: 8, decision: 'keep' }),
  );
  expect(await screen.findByText('Kept as it is')).toBeOnTheScreen();
});

it('offers nothing for a change that is out of date', async () => {
  decides(null, 'BB036');
  await render(<ProposalCard card={TARGETS} state={pending} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Apply' }));
  await screen.findByText('This is out of date');

  expect(screen.queryByRole('button')).not.toBeOnTheScreen();
});

it('does not apply while Keep as is is sent', async () => {
  jest.mocked(supabase.rpc).mockReturnValue(new Promise(() => {}) as never);
  await render(<ProposalCard card={TARGETS} state={pending} />);

  await fireEvent.press(screen.getByRole('button', { name: 'Keep as is' }));

  await waitFor(() => expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled());
});

it('offers Apply again after a request that failed', async () => {
  jest.mocked(supabase.rpc).mockRejectedValue(new Error('Network request failed'));
  await render(<ProposalCard card={TARGETS} state={pending} />);

  await fireEvent.press(screen.getByRole('button', { name: 'Apply' }));

  expect(await screen.findByText("That didn't work. Try again.")).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Apply' })).toBeOnTheScreen();
});

it('no longer offers Undo when what applying left changed since', async () => {
  decides(null, 'BB035');
  await render(<ProposalCard card={WORKOUT} state={{ ...pending, status: 'applied' }} />);

  await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));

  expect(await screen.findByText('This changed since — ask Bite again')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeOnTheScreen();
  expect(screen.getByText('Applied: Leg press instead of Back squat')).toBeOnTheScreen();
});

it('says a proposal that waited too long is out of date', async () => {
  await render(<ProposalCard card={WORKOUT} state={{ status: 'pending', expired: true }} />);

  expect(screen.getByText('This is out of date')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeOnTheScreen();
});

it('waits for where a proposal stands before it may be applied', async () => {
  await render(<ProposalCard card={WORKOUT} waiting />);

  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Keep as is' })).toBeDisabled();
});

it('stays applied when Bite proposes again while Apply is sent', async () => {
  // The first list says the card is pending; the next, with the new proposal, never comes.
  jest.mocked(supabase.from).mockReturnValueOnce({
    select: () => ({
      in: () =>
        Promise.resolve({
          data: [{ id: 8, status: 'pending', expires_at: '2099-01-01T00:00:00Z' }],
          error: null,
        }),
    }),
  } as never);
  jest
    .mocked(supabase.from)
    .mockReturnValue({ select: () => ({ in: () => new Promise(() => {}) }) } as never);
  let applied: (value: unknown) => void = () => {};
  jest.mocked(supabase.rpc).mockReturnValue(
    new Promise((resolve) => {
      applied = resolve;
    }) as never,
  );
  function Chat({ ids }: { ids: number[] }) {
    const states = useProposalStates(ids);
    return <ProposalCard card={TARGETS} state={states.data?.get(8)} />;
  }
  await render(<Chat ids={[8]} />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Apply' }));

  await screen.rerender(<Chat ids={[8, 9]} />);
  await act(async () => applied({ data: 'applied', error: null }));

  expect(screen.getByText('Applied: 2,100 kcal and 150 g protein a day')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeOnTheScreen();
});
