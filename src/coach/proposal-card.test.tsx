import { addDays, toIsoDate } from '@/i18n/dates';
import { supabase } from '@/lib/supabase';
import { act, fireEvent, render, screen, waitFor } from '@/test/render';

import { ProposalCard } from './proposal-card';
import { type ProposalState, type ShownProposal as Card, useProposalStates } from './proposals';

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
const TODAY = toIsoDate(new Date());
const YESTERDAY = toIsoDate(addDays(new Date(), -1));
const FOOD_LOG: Card = {
  kind: 'food_log',
  id: 9,
  changes: [
    {
      food: 'Pizza Margherita',
      from: { day: TODAY, meal: 'lunch', grams: 150, kcal: 399 },
      to: { day: TODAY, meal: 'dinner', grams: 150, kcal: 399 },
    },
    { food: 'Chocolate bar', from: { day: TODAY, meal: 'snack', grams: 50, kcal: 268 } },
  ],
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

it('says a proposal a newer one replaced, with nothing to decide', async () => {
  await render(<ProposalCard card={WORKOUT} state={{ ...pending, status: 'replaced' }} />);

  expect(screen.getByText('Replaced by the newer proposal below')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeOnTheScreen();
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

const LEGS = { name: 'Legs', type: null };
const SWAP = {
  from: 'Back squat',
  to: 'Leg press',
  sets: 3,
  target: { reps: { min: 10, max: 12 } },
  why: 'easier on the knee',
};
const PLAN: Card = {
  kind: 'workouts',
  id: 10,
  workouts: [
    {
      workout: LEGS,
      weekdays: [1, 4],
      swaps: [SWAP],
      removed: [{ name: 'Plank', why: 'done at home' }],
      added: [],
    },
    {
      workout: { name: 'Push', type: null },
      weekdays: [2],
      swaps: [],
      removed: [],
      added: [{ name: 'Leg curl', sets: 3, target: { reps: { min: 10, max: 12 } } }],
    },
  ],
};
const ALTERNATIVE: Card = {
  kind: 'alternative',
  id: 11,
  workout: LEGS,
  from: { name: 'Gym', position: 1 },
  to: 'Knee-safe',
  swaps: [SWAP],
  removed: [],
  added: [],
};
const SWITCH: Card = {
  kind: 'alternative_switch',
  id: 12,
  workout: LEGS,
  from: { name: 'Knee-safe', position: 2 },
  to: { name: null, position: 1 },
  back: ['Leg curl'],
  empty: false,
};

describe('changes to workouts and their alternatives', () => {
  it('shows each workout a change names, with what it swaps, leaves out and adds', async () => {
    await render(<ProposalCard card={PLAN} state={pending} />);

    expect(screen.getByText('2 workouts')).toBeOnTheScreen();
    expect(screen.getByText('Mon, Thu')).toBeOnTheScreen();
    expect(screen.getByText('Push')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Leg press instead of Back squat, 3 × 10–12 reps · easier on the knee'),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Plank, Left out · done at home')).toBeOnTheScreen();
    expect(screen.getByLabelText('Leg curl, Added · 3 × 10–12 reps')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeOnTheScreen();
  });

  it('shows a change to one workout under its name, from today', async () => {
    await render(
      <ProposalCard
        card={{ ...PLAN, workouts: PLAN.workouts.slice(0, 1) } as Card}
        state={pending}
      />,
    );

    expect(screen.getByText('Legs')).toBeOnTheScreen();
    expect(screen.getByText('From today')).toBeOnTheScreen();
    expect(screen.queryByText('Mon, Thu')).not.toBeOnTheScreen();
  });

  it('sums up applied changes to several workouts', async () => {
    await render(<ProposalCard card={PLAN} state={{ ...pending, status: 'applied' }} />);

    expect(screen.getByText('Applied: changes to 2 workouts')).toBeOnTheScreen();
  });

  it('shows a new alternative made from the one in use, to use', async () => {
    await render(<ProposalCard card={ALTERNATIVE} state={pending} />);

    expect(screen.getByText('New alternative')).toBeOnTheScreen();
    expect(screen.getByLabelText('From Gym to Knee-safe')).toBeOnTheScreen();
    expect(
      screen.getByText('The other versions of Legs stay as they are, to switch back to.'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Use it' })).toBeOnTheScreen();
  });

  it('names an alternative without a name by its place', async () => {
    const card = { ...ALTERNATIVE, from: { name: null, position: 1 } } as Card;
    await render(<ProposalCard card={card} state={pending} />);

    expect(screen.getByLabelText('From Alternative 1 to Knee-safe')).toBeOnTheScreen();
  });

  it('sums up an applied alternative by the one now in use', async () => {
    await render(<ProposalCard card={ALTERNATIVE} state={{ ...pending, status: 'applied' }} />);

    expect(screen.getByText('Applied: Legs now uses Knee-safe')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeOnTheScreen();
  });

  it('shows a switch with what comes back, and that the one in use stays', async () => {
    await render(<ProposalCard card={SWITCH} state={pending} />);

    expect(screen.getByLabelText('From Knee-safe to Alternative 1')).toBeOnTheScreen();
    expect(
      screen.getByText('Leg curl comes back. Knee-safe is kept, to use again.'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Switch' })).toBeOnTheScreen();
  });

  it('says that a switch to an alternative without exercises leaves the workout without any', async () => {
    const card = { ...SWITCH, back: [], empty: true } as Card;
    await render(<ProposalCard card={card} state={pending} />);

    expect(
      screen.getByText(
        'Alternative 1 has no exercises yet, so Legs will have none until you add some.',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText('Knee-safe is kept, to use again.')).toBeOnTheScreen();
  });

  it('sums up an applied switch', async () => {
    await render(<ProposalCard card={SWITCH} state={{ ...pending, status: 'applied' }} />);

    expect(screen.getByText('Applied: Legs now uses Alternative 1')).toBeOnTheScreen();
  });
});

describe('a food log change', () => {
  it('shows each entry it moves and removes, on its day', async () => {
    await render(<ProposalCard card={FOOD_LOG} state={pending} />);

    expect(screen.getByRole('header')).toHaveTextContent('Food log');
    expect(screen.getByText('Today')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Pizza Margherita, Dinner instead of Lunch, 150 g, 399 kcal'),
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Chocolate bar: Remove from snacks · 50 g · 268 kcal'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Keep as is' })).toBeOnTheScreen();
  });

  it('names the days of entries on more than one, and new grams', async () => {
    const card: Card = {
      kind: 'food_log',
      id: 10,
      changes: [
        {
          food: 'Rice',
          from: { day: TODAY, meal: 'lunch', grams: 200, kcal: 260 },
          to: { day: YESTERDAY, meal: 'lunch', grams: 100, kcal: 130 },
        },
      ],
    };
    await render(<ProposalCard card={card} state={pending} />);

    expect(screen.queryByText('Today')).not.toBeOnTheScreen();
    expect(
      screen.getByLabelText(
        'Rice, Lunch, Yesterday instead of Lunch, Today, 100 g instead of 200 g, 130 kcal',
      ),
    ).toBeOnTheScreen();
  });

  it('applies, folds into a line that sums it up, and undoes it', async () => {
    decides('applied');
    await render(<ProposalCard card={FOOD_LOG} state={pending} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Apply' }));

    expect(supabase.rpc).toHaveBeenCalledWith(
      'decide_coach_proposal',
      expect.objectContaining({ proposal_id: 9, decision: 'apply' }),
    );
    expect(await screen.findByText('Applied: 2 changes to your food log')).toBeOnTheScreen();
    expect(
      screen.getByText('Pizza Margherita to dinner · Chocolate bar removed'),
    ).toBeOnTheScreen();

    decides('undone');
    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    expect(supabase.rpc).toHaveBeenLastCalledWith(
      'decide_coach_proposal',
      expect.objectContaining({ proposal_id: 9, decision: 'undo' }),
    );
    expect(await screen.findByText('Undone')).toBeOnTheScreen();
  });

  it('keeps the food log as it is', async () => {
    decides('kept');
    await render(<ProposalCard card={FOOD_LOG} state={pending} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Keep as is' }));

    expect(await screen.findByText('Kept as it is')).toBeOnTheScreen();
  });

  it('sums up a change of grams and a move to another day', async () => {
    const card: Card = {
      kind: 'food_log',
      id: 11,
      changes: [
        {
          food: 'Rice',
          from: { day: TODAY, meal: 'lunch', grams: 200, kcal: 260 },
          to: { day: TODAY, meal: 'lunch', grams: 100, kcal: 130 },
        },
        {
          food: 'Soup',
          from: { day: TODAY, meal: 'dinner', grams: 300, kcal: 150 },
          to: { day: YESTERDAY, meal: 'dinner', grams: 300, kcal: 150 },
        },
      ],
    };
    await render(<ProposalCard card={card} state={{ ...pending, status: 'applied' }} />);

    expect(screen.getByText('Rice now 100 g · Soup to Yesterday')).toBeOnTheScreen();
  });

  it('names the day and the grams of an entry moved to another meal on another day', async () => {
    const card: Card = {
      kind: 'food_log',
      id: 12,
      changes: [
        {
          food: 'Pizza',
          from: { day: TODAY, meal: 'lunch', grams: 300, kcal: 798 },
          to: { day: YESTERDAY, meal: 'dinner', grams: 150, kcal: 399 },
        },
      ],
    };
    await render(<ProposalCard card={card} state={{ ...pending, status: 'applied' }} />);

    expect(screen.getByText('Pizza to dinner, Yesterday, 150 g')).toBeOnTheScreen();
  });

  it.each([
    ['BB035', 'This changed since — ask Bite again'],
    ['BB020', 'That day can no longer be changed'],
  ])('says why a change refused with %s cannot be applied, and may be kept', async (code, line) => {
    decides(null, code);
    await render(<ProposalCard card={FOOD_LOG} state={pending} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText(line)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Keep as is' })).toBeOnTheScreen();
  });

  it('no longer offers Undo once an entry changed since it was applied', async () => {
    decides(null, 'BB035');
    await render(<ProposalCard card={FOOD_LOG} state={{ ...pending, status: 'applied' }} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));

    expect(await screen.findByText('This changed since — ask Bite again')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeOnTheScreen();
  });
});
