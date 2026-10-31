// What Bite's cards in the chat share, proposals and meal cards alike: reading one back from a
// stored message, the key their states load under, and what a refused action means for the card.
import type { Json } from '@/lib/database.types';

/**
 * Why acting on a card was refused: what it changes changed since (BB035), it is out of date or
 * decided already (BB036), or gone (P0002), the targets are now under the calorie floor (BB037),
 * a day it changes can no longer be logged (BB020), or the request failed.
 */
export type CardFailure = 'changed' | 'outOfDate' | 'underFloor' | 'closedDay' | 'failed';

const FAILURES: Record<string, CardFailure> = {
  BB020: 'closedDay',
  BB035: 'changed',
  BB036: 'outOfDate',
  BB037: 'underFloor',
  P0002: 'outOfDate',
};

/** What a refused action means for the card. */
export function cardFailure(error: unknown): CardFailure {
  const code = (error as { code?: unknown } | null)?.code;
  return (typeof code === 'string' && FAILURES[code]) || 'failed';
}

/**
 * The refusal a card shows, which only belongs to the state it was refused in: an undo is refused
 * done, anything else before. Once the card moved on, as when loaded again, it shows none.
 */
export function refusalOf(
  action: { isError: boolean; error: unknown },
  wasUndo: boolean,
  done: boolean,
): CardFailure | undefined {
  return action.isError && wasUndo === done ? cardFailure(action.error) : undefined;
}

/**
 * Whether a done card still offers Undo after `refused`: not once what it changed changed since,
 * it is out of date, or its day is closed.
 */
export function canUndo(refused: CardFailure | undefined): boolean {
  return refused !== 'changed' && refused !== 'outOfDate' && refused !== 'closedDay';
}

/** The field `key` of a stored part of Bite's message, when the part is a tool's result. */
export function toolResultField(part: Json, key: string): Json | undefined {
  if (!part || typeof part !== 'object' || Array.isArray(part) || part.type !== 'toolResult') {
    return undefined;
  }
  const result = part.result;
  return result && typeof result === 'object' && !Array.isArray(result) ? result[key] : undefined;
}

/** The query key of the states of the cards `ids` under `base`, alike in any order. */
export function cardStatesKey(base: readonly string[], ids: number[]) {
  return [...base, [...ids].sort((a, b) => a - b)];
}
