import { canUndo, cardFailure, cardStatesKey, refusalOf, toolResultField } from './cards';

describe('cardFailure', () => {
  it("tells the database's refusals apart", () => {
    expect(cardFailure({ code: 'BB035' })).toBe('changed');
    expect(cardFailure({ code: 'BB036' })).toBe('outOfDate');
    expect(cardFailure({ code: 'P0002' })).toBe('outOfDate');
    expect(cardFailure({ code: 'BB037' })).toBe('underFloor');
    expect(cardFailure({ code: 'BB020' })).toBe('closedDay');
    expect(cardFailure(new Error('Network request failed'))).toBe('failed');
  });
});

describe('refusalOf', () => {
  const refused = { isError: true, error: { code: 'BB035' } };

  it('shows an undo refused while the card is done', () => {
    expect(refusalOf(refused, true, true)).toBe('changed');
  });

  it('shows an add or apply refused while the card is pending', () => {
    expect(refusalOf(refused, false, false)).toBe('changed');
  });

  it('shows nothing once the card moved on from where it was refused', () => {
    expect(refusalOf(refused, true, false)).toBeUndefined();
    expect(refusalOf({ isError: false, error: null }, true, true)).toBeUndefined();
  });
});

describe('canUndo', () => {
  it('offers Undo until what it changed changed, it went out of date or its day closed', () => {
    expect(canUndo(undefined)).toBe(true);
    expect(canUndo('failed')).toBe(true);
    expect(canUndo('changed')).toBe(false);
    expect(canUndo('outOfDate')).toBe(false);
    expect(canUndo('closedDay')).toBe(false);
  });
});

describe('toolResultField', () => {
  it("reads a field of a tool's result, and nothing from other parts", () => {
    const part = { type: 'toolResult', name: 'x', result: { mealCard: { id: 1 } } };
    expect(toolResultField(part, 'mealCard')).toEqual({ id: 1 });
    expect(toolResultField(part, 'proposal')).toBeUndefined();
    expect(toolResultField({ type: 'text', text: 'hi' }, 'mealCard')).toBeUndefined();
    expect(toolResultField(null, 'mealCard')).toBeUndefined();
  });
});

describe('cardStatesKey', () => {
  it('is the same for the same ids in any order', () => {
    expect(cardStatesKey(['k'], [3, 1, 2])).toEqual(cardStatesKey(['k'], [2, 3, 1]));
  });
});
