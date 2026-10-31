// Bite's proposals (#297, ADR 0058): where each one stands, and the user applying it, keeping
// things as they are, or undoing it. Bite only proposes; decide_coach_proposal() makes the change,
// as the user, while what it replaces is still so.
import { type ProposalCard, SHOWN_PROPOSAL_KINDS } from '@shared/coach/chat';
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
import { reloadDay } from '@/nutrition/entries';
import { reloadTargets } from '@/nutrition/targets';
import { reloadPlan } from '@/workouts/workouts';

import { cardFailure, cardStatesKey, toolResultField } from './cards';
import type { ChatMessage } from './use-chat';

export const PROPOSALS_KEY = ['coach-proposals'];

export type ProposalStatus = Database['public']['Enums']['coach_proposal_status'];
export type ProposalDecision = Database['public']['Enums']['coach_proposal_decision'];

/** A proposal of a kind the chat shows a card for (`SHOWN_PROPOSAL_KINDS`). */
export type ShownProposal = Extract<ProposalCard, { kind: (typeof SHOWN_PROPOSAL_KINDS)[number] }>;

/** Whether the chat shows a card for `card`, of a kind it knows. */
export function isShownProposal(card: { kind?: unknown; id?: unknown }): card is ShownProposal {
  return (
    typeof card.id === 'number' && (SHOWN_PROPOSAL_KINDS as readonly unknown[]).includes(card.kind)
  );
}

/**
 * Where a proposal stands: pending until the user decides, and whether it waited too long, as of
 * when it loaded.
 */
export type ProposalState = { status: ProposalStatus; expired: boolean };

/** The ids of the proposals among `messages`, as `useProposalStates` loads them. */
export function proposalIds(messages: ChatMessage[]): number[] {
  return messages.flatMap((message) => message.proposals?.map((card) => card.id) ?? []);
}

/** The card a stored part of Bite's message keeps, when it is a proposal's tool result. */
function cardOf(part: Json): ShownProposal | undefined {
  const proposal = toolResultField(part, 'proposal');
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) {
    return undefined;
  }
  return isShownProposal(proposal) ? (proposal as unknown as ShownProposal) : undefined;
}

/** The cards of the proposals a stored message made, in order. */
export function messageProposals(content: Json): ShownProposal[] {
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

/**
 * Where the proposals `ids` stand, by id. The last states stay while new ones load, as when
 * Bite proposes again, so that the cards on the screen keep theirs.
 */
export function useProposalStates(ids: number[]) {
  return useQuery({
    queryKey: cardStatesKey(PROPOSALS_KEY, ids),
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
export function useDecideProposal(card: ShownProposal) {
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
      if (cardFailure(error) === 'outOfDate') {
        void queryClient.invalidateQueries({ queryKey: PROPOSALS_KEY });
      }
    },
  });
}

/**
 * Loads again what a proposal applied or undone changed: the plan, the targets, or each day of the
 * food log it moved entries from or to.
 */
function reloadChanged(queryClient: QueryClient, card: ShownProposal) {
  switch (card.kind) {
    case 'workout':
      return reloadPlan(queryClient);
    case 'targets':
      return reloadTargets(queryClient);
    case 'food_log': {
      return Promise.all(foodLogDays(card).map((day) => reloadDay(queryClient, day)));
    }
  }
}

/** The days a food log proposal moves entries from or to, each once, in order. */
export function foodLogDays(card: Extract<ShownProposal, { kind: 'food_log' }>): string[] {
  return [...new Set(card.changes.flatMap(({ from, to }) => [from.day, to?.day ?? from.day]))];
}
