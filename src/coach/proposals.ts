// Bite's proposals (#297, ADR 0058): where each one stands, and the user applying it, keeping
// things as they are, or undoing it. Bite only proposes; decide_coach_proposal() makes the change,
// as the user, while what it replaces is still so.
import type { ProposalCard } from '@shared/coach/chat';
import {
  keepPreviousData,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { toIsoDate } from '@/i18n/dates';
import type { Database, Json } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { reloadTargets } from '@/nutrition/targets';
import { reloadPlan } from '@/workouts/workouts';

import type { ChatMessage } from './use-chat';

export const PROPOSALS_KEY = ['coach-proposals'];

export type ProposalStatus = Database['public']['Enums']['coach_proposal_status'];
export type ProposalDecision = Database['public']['Enums']['coach_proposal_decision'];

/**
 * Where a proposal stands: pending until the user decides, and whether it waited too long, as of
 * when it loaded.
 */
export type ProposalState = { status: ProposalStatus; expired: boolean };

/**
 * Why a decision was refused: what it changes changed since (BB035), it is out of date or decided
 * already (BB036), or gone (P0002), the targets are now under the calorie floor (BB037), or the
 * request failed.
 */
export type ProposalFailure = 'changed' | 'outOfDate' | 'underFloor' | 'failed';

const FAILURES: Record<string, ProposalFailure> = {
  BB035: 'changed',
  BB036: 'outOfDate',
  BB037: 'underFloor',
  P0002: 'outOfDate',
};

/** What a refused decision means for the card. */
export function proposalFailure(error: unknown): ProposalFailure {
  const code = (error as { code?: unknown } | null)?.code;
  return (typeof code === 'string' && FAILURES[code]) || 'failed';
}

/** The ids of the proposals among `messages`, as `useProposalStates` loads them. */
export function proposalIds(messages: ChatMessage[]): number[] {
  return messages.flatMap((message) => message.proposals?.map((card) => card.id) ?? []);
}

/** The card a stored part of Bite's message keeps, when it is a proposal's tool result. */
function cardOf(part: Json): ProposalCard | undefined {
  if (!part || typeof part !== 'object' || Array.isArray(part) || part.type !== 'toolResult') {
    return undefined;
  }
  const result = part.result;
  const proposal =
    result && typeof result === 'object' && !Array.isArray(result) ? result.proposal : undefined;
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) {
    return undefined;
  }
  const known =
    typeof proposal.id === 'number' && (proposal.kind === 'workout' || proposal.kind === 'targets');
  return known ? (proposal as unknown as ProposalCard) : undefined;
}

/** The cards of the proposals a stored message made, in order. */
export function messageProposals(content: Json): ProposalCard[] {
  return (Array.isArray(content) ? content : []).flatMap((part) => {
    const card = cardOf(part);
    return card ? [card] : [];
  });
}

type StateRow = Pick<
  Database['public']['Tables']['coach_proposals']['Row'],
  'id' | 'status' | 'expires_at'
>;

function statesOf(rows: StateRow[]): Map<number, ProposalState> {
  const now = Date.now();
  return new Map(
    rows.map((row) => [
      row.id,
      { status: row.status, expired: new Date(row.expires_at).getTime() <= now },
    ]),
  );
}

/** The query key of the states of the proposals `ids`. */
const statesKey = (ids: number[]) => [...PROPOSALS_KEY, [...ids].sort((a, b) => a - b)];

/**
 * Where the proposals `ids` stand, by id. The last states stay while new ones load, as when
 * Bite proposes again, so that the cards on the screen keep theirs.
 */
export function useProposalStates(ids: number[]) {
  return useQuery({
    queryKey: statesKey(ids),
    enabled: ids.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coach_proposals')
        .select('id, status, expires_at')
        .in('id', ids);
      if (error) {
        throw error;
      }
      return data;
    },
    select: statesOf,
  });
}

/**
 * Applies a proposal, keeps things as they are, or undoes it, as of the device's today. The new
 * status goes into every list of states that has it, and what it changed loads again.
 */
export function useDecideProposal(card: ProposalCard) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (decision: ProposalDecision) => {
      const { data, error } = await supabase.rpc('decide_coach_proposal', {
        proposal_id: card.id,
        decision,
        today: toIsoDate(new Date()),
      });
      if (error) {
        throw error;
      }
      return data;
    },
    onSuccess: (status, decision) => {
      queryClient.setQueriesData<StateRow[]>({ queryKey: PROPOSALS_KEY }, (rows) =>
        rows?.map((row) => (row.id === card.id ? { ...row, status } : row)),
      );
      // A list loading meanwhile, as when Bite proposed again, may have read it as it was.
      void queryClient.invalidateQueries({ queryKey: PROPOSALS_KEY });
      if (decision !== 'keep') {
        void reloadChanged(queryClient, card);
      }
    },
    onError: (error) => {
      // Decided elsewhere, or gone: the card shows where it stands now.
      if (proposalFailure(error) === 'outOfDate') {
        void queryClient.invalidateQueries({ queryKey: PROPOSALS_KEY });
      }
    },
  });
}

/** Loads again what a proposal applied or undone changed: the plan, or the targets. */
function reloadChanged(queryClient: QueryClient, card: ProposalCard) {
  return card.kind === 'workout' ? reloadPlan(queryClient) : reloadTargets(queryClient);
}
