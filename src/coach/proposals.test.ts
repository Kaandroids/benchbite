import type { ProposalCard } from '@shared/coach/chat';

import { supabase } from '@/lib/supabase';
import { act, createTestQueryClient, renderHook, waitFor } from '@/test/render';

import {
  messageProposals,
  proposalFailure,
  useDecideProposal,
  useProposalStates,
} from './proposals';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

const WORKOUT: ProposalCard = {
  kind: 'workout',
  id: 7,
  workout: { name: 'Lower body', type: null },
  swaps: [{ from: 'Back squat', to: 'Leg press', sets: 3, target: { reps: { min: 10, max: 12 } } }],
};
const TARGETS: ProposalCard = {
  kind: 'targets',
  id: 8,
  to: { calories: 2100, proteinG: 150, carbsG: 220, fatG: 70 },
};

/** Lets coach_proposals answer with `rows`. */
function proposalRows(rows: { id: number; status: string; expires_at: string }[]) {
  const inIds = jest.fn().mockResolvedValue({ data: rows, error: null });
  jest.mocked(supabase.from).mockReturnValue({ select: () => ({ in: inIds }) } as never);
  return inIds;
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.useRealTimers());

describe('messageProposals', () => {
  it("reads the cards out of a stored message's tool results, in order", () => {
    expect(
      messageProposals([
        { type: 'text', text: 'Try this:' },
        { type: 'toolResult', name: 'get_workouts', result: { workouts: [] } },
        { type: 'toolResult', name: 'propose_workout_change', result: { proposal: WORKOUT } },
        { type: 'toolResult', name: 'propose_targets_change', result: { proposal: TARGETS } },
        { type: 'toolResult', name: 'propose_targets_change', result: { error: 'Too low' } },
      ]),
    ).toEqual([WORKOUT, TARGETS]);
  });

  it('reads nothing of content that holds no cards', () => {
    expect(messageProposals(null)).toEqual([]);
    expect(
      messageProposals([{ type: 'toolResult', name: 'x', result: { proposal: { id: 'x' } } }]),
    ).toEqual([]);
  });
});

describe('proposalFailure', () => {
  it("tells the database's refusals apart", () => {
    expect(proposalFailure({ code: 'BB035' })).toBe('changed');
    expect(proposalFailure({ code: 'BB036' })).toBe('outOfDate');
    expect(proposalFailure({ code: 'P0002' })).toBe('outOfDate');
    expect(proposalFailure({ code: 'BB037' })).toBe('underFloor');
    expect(proposalFailure(new Error('Network request failed'))).toBe('failed');
  });
});

describe('useProposalStates', () => {
  it('loads where the proposals stand, by id', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-30T12:00:00Z'), advanceTimers: true });
    const inIds = proposalRows([
      { id: 7, status: 'applied', expires_at: '2026-11-06T12:00:00Z' },
      { id: 8, status: 'pending', expires_at: '2026-11-06T12:00:00Z' },
      { id: 9, status: 'pending', expires_at: '2026-10-29T12:00:00Z' },
    ]);
    const { result } = await renderHook(() => useProposalStates([8, 7, 9]));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.from).toHaveBeenCalledWith('coach_proposals');
    expect(inIds).toHaveBeenCalledWith('id', [8, 7, 9]);
    expect(result.current.data?.get(7)).toEqual({ status: 'applied', expired: false });
    expect(result.current.data?.get(9)).toEqual({ status: 'pending', expired: true });
    expect(result.current.data?.get(8)?.status).toBe('pending');
  });

  it('loads nothing without proposals', async () => {
    await renderHook(() => useProposalStates([]));

    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('useDecideProposal', () => {
  it("applies a workout change as of the device's today, and loads the plan again", async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 30, 9, 0), advanceTimers: true });
    proposalRows([{ id: 7, status: 'pending', expires_at: '2026-11-06T12:00:00Z' }]);
    jest.mocked(supabase.rpc).mockResolvedValue({ data: 'applied', error: null } as never);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await renderHook(
      () => ({ states: useProposalStates([7]), decide: useDecideProposal(WORKOUT) }),
      { queryClient },
    );
    await waitFor(() => expect(result.current.states.isSuccess).toBe(true));

    await act(() => result.current.decide.mutateAsync('apply'));

    expect(supabase.rpc).toHaveBeenCalledWith('decide_coach_proposal', {
      proposal_id: 7,
      decision: 'apply',
      today: '2026-10-30',
    });
    await waitFor(() => expect(result.current.states.data?.get(7)?.status).toBe('applied'));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['workouts'] });
  });

  it('loads the targets again when new ones are undone', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ data: 'undone', error: null } as never);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await renderHook(() => useDecideProposal(TARGETS), { queryClient });

    await act(() => result.current.mutateAsync('undo'));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['nutrition-targets'] });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['workouts'] });
  });

  it('changes nothing else when things are kept as they are', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ data: 'kept', error: null } as never);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await renderHook(() => useDecideProposal(TARGETS), { queryClient });

    await act(() => result.current.mutateAsync('keep'));

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('loads where the proposals stand again when one is out of date', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { code: 'BB036' } } as never);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await renderHook(() => useDecideProposal(WORKOUT), { queryClient });

    await expect(act(() => result.current.mutateAsync('apply'))).rejects.toEqual({
      code: 'BB036',
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['coach-proposals'] }));
  });
});
