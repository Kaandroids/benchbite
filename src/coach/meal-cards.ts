// Bite's meal cards (#299, ADR 0066): where each one stands, and the user adding it, with the
// grams they may change, or undoing it. Bite only keeps the card; log_coach_meal_card() logs it,
// as the user, and undo_coach_meal_card() takes it back while its entries are as logged.
import type { MealCard } from '@shared/coach/chat';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Database, Json } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { reloadDay } from '@/nutrition/entries';
import { reloadFoods } from '@/nutrition/quick-foods';

import { proposalFailure } from './proposals';
import type { ChatMessage } from './use-chat';

export type { MealCard };

export const MEAL_CARDS_KEY = ['coach-meal-cards'];

export type MealCardStatus = Database['public']['Enums']['coach_meal_card_status'];

type StateRow = Pick<
  Database['public']['Tables']['coach_meal_cards']['Row'],
  'id' | 'status' | 'kcal'
>;

/** Where a card stands, and what it added once logged, in kcal. */
export type MealCardState = { status: MealCardStatus; kcal: number | null };

/** Whether `card` is a meal card, as a tool's result keeps it. */
function isMealCard(card: unknown): card is MealCard {
  const value = card as Partial<MealCard> | null;
  return (
    typeof value?.id === 'number' &&
    typeof value.day === 'string' &&
    typeof value.meal === 'string' &&
    Array.isArray(value.items)
  );
}

/** The card a stored part of Bite's message keeps, when it is a meal card's tool result. */
function cardOf(part: Json): MealCard | undefined {
  if (!part || typeof part !== 'object' || Array.isArray(part) || part.type !== 'toolResult') {
    return undefined;
  }
  const result = part.result;
  const card =
    result && typeof result === 'object' && !Array.isArray(result) ? result.mealCard : undefined;
  return isMealCard(card) ? card : undefined;
}

/** The meal cards a stored message holds, in order. */
export function messageMealCards(content: Json): MealCard[] {
  return (Array.isArray(content) ? content : []).flatMap((part) => {
    const card = cardOf(part);
    return card ? [card] : [];
  });
}

/** The ids of the meal cards among `messages`, as `useMealCardStates` loads them. */
export function mealCardIds(messages: ChatMessage[]): number[] {
  return messages.flatMap((message) => message.mealCards?.map((card) => card.id) ?? []);
}

function statesOf(rows: StateRow[]): Map<number, MealCardState> {
  return new Map(rows.map((row) => [row.id, { status: row.status, kcal: row.kcal }]));
}

/** The query key of the states of the cards `ids`. */
const statesKey = (ids: number[]) => [...MEAL_CARDS_KEY, [...ids].sort((a, b) => a - b)];

/**
 * Where the meal cards `ids` stand, by id, read in one request. The last states stay while new
 * ones load, as when Bite makes another card, so that the cards on the screen keep theirs.
 */
export function useMealCardStates(ids: number[]) {
  return useQuery({
    queryKey: statesKey(ids),
    enabled: ids.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coach_meal_cards')
        .select('id, status, kcal')
        .in('id', ids);
      if (error) {
        throw error;
      }
      return data;
    },
    select: statesOf,
  });
}

/** What the user does with a card: adds it, at the grams of its items, or undoes it. */
export type MealCardAction = { action: 'log'; grams: number[] } | { action: 'undo' };

/**
 * Adds a meal card, with the grams the user may have changed, or undoes it. Its new status goes
 * into every list of states that has it, and the day it is logged on loads again, with the foods
 * when it saved or removed some of the user's own.
 */
export function useMealCardAction(card: MealCard) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: MealCardAction) => {
      const { data, error } =
        request.action === 'log'
          ? await supabase.rpc('log_coach_meal_card', {
              card_id: card.id,
              // Only grams that changed are sent, so that the card logs as Bite gave it otherwise.
              ...(request.grams.some((grams, index) => grams !== card.items[index]?.grams) && {
                grams: request.grams,
              }),
            })
          : await supabase.rpc('undo_coach_meal_card', { card_id: card.id });
      if (error) {
        throw error;
      }
      return data;
    },
    onSuccess: (row) => {
      queryClient.setQueriesData<StateRow[]>({ queryKey: MEAL_CARDS_KEY }, (rows) =>
        rows?.map((state) =>
          state.id === card.id ? { ...state, status: row.status, kcal: row.kcal } : state,
        ),
      );
      // A list loading meanwhile, as when Bite made another card, may have read it as it was.
      void queryClient.invalidateQueries({ queryKey: MEAL_CARDS_KEY });
      void reloadDay(queryClient, card.day);
      if (row.food_ids?.length) {
        void reloadFoods(queryClient);
      }
    },
    onError: (error) => {
      // Added or undone elsewhere, or gone: the card shows where it stands now.
      if (proposalFailure(error) === 'outOfDate') {
        void queryClient.invalidateQueries({ queryKey: MEAL_CARDS_KEY });
      }
    },
  });
}
