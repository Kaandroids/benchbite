import { calculateTargets, generatePlan, type WorkoutPlan } from '@/onboarding/plan';
import { createStep } from '@/test/step-mock';
import { act, fireEvent, render, screen } from '@/test/render';

import { BuildingStep } from './building';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));
jest.mock('@/onboarding/plan', () => ({ calculateTargets: jest.fn(), generatePlan: jest.fn() }));

const TARGETS = { calories: 2200, proteinG: 150, carbsG: 250, fatG: 70 };
const PLAN: WorkoutPlan = { sessions: [] };
const LINES = [
  'Calculating your calories',
  'Choosing your exercises',
  'Putting your week together',
];

/**
 * Whether a line of the checklist is done, in progress or still to come. The lines expose no
 * accessibility state, so this looks at the marker next to the text: a check icon or a spinner.
 */
function lineState(text: string): 'done' | 'current' | 'pending' {
  const line = screen.getByText(text).parent!;
  const has = (type: string) => line.queryAll((node) => node.type === type).length > 0;
  return has('ViewManagerAdapter_SymbolModule')
    ? 'done'
    : has('ActivityIndicator')
      ? 'current'
      : 'pending';
}

const states = () => LINES.map(lineState);

const advance = (ms: number) => act(() => jest.advanceTimersByTimeAsync(ms));

describe('BuildingStep', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockStep = createStep({ goal: 'lose_fat' });
  });

  afterEach(() => jest.useRealTimers());

  it('calculates the targets and the plan from the answers', async () => {
    jest.mocked(calculateTargets).mockResolvedValue(TARGETS);
    jest.mocked(generatePlan).mockResolvedValue(PLAN);
    await render(<BuildingStep />);
    expect(calculateTargets).toHaveBeenCalledWith({ goal: 'lose_fat' });
    expect(generatePlan).toHaveBeenCalledWith({ goal: 'lose_fat' });
  });

  it('ticks the checklist, then moves on with the result', async () => {
    jest.mocked(calculateTargets).mockResolvedValue(TARGETS);
    jest.mocked(generatePlan).mockResolvedValue(PLAN);
    await render(<BuildingStep />);
    expect(states()).toEqual(['current', 'pending', 'pending']);

    await advance(900);
    expect(states()).toEqual(['done', 'current', 'pending']);

    await advance(900);
    expect(states()).toEqual(['done', 'done', 'current']);

    await advance(900);
    expect(states()).toEqual(['done', 'done', 'done']);
    expect(mockStep.next).not.toHaveBeenCalled();

    await advance(450);
    expect(mockStep.next).toHaveBeenCalledWith({ targets: TARGETS, plan: PLAN });
  });

  it('waits on the last line until the work is done', async () => {
    let finish: (plan: WorkoutPlan) => void = () => {};
    jest.mocked(calculateTargets).mockResolvedValue(TARGETS);
    jest.mocked(generatePlan).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await render(<BuildingStep />);

    await advance(10_000);
    expect(states()).toEqual(['done', 'done', 'current']);
    expect(mockStep.next).not.toHaveBeenCalled();

    await act(async () => finish(PLAN));
    await advance(450);
    expect(mockStep.next).toHaveBeenCalledWith({ targets: TARGETS, plan: PLAN });
  });

  it('shows an error on failure and tries again', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(calculateTargets).mockRejectedValueOnce(new Error('offline'));
    jest.mocked(generatePlan).mockResolvedValue(PLAN);
    await render(<BuildingStep />);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();

    await advance(2700);
    expect(
      screen.getByText("We couldn't build your plan. Check your connection and try again."),
    ).toBeTruthy();
    expect(warn).toHaveBeenCalled();
    expect(mockStep.next).not.toHaveBeenCalled();

    jest.mocked(calculateTargets).mockResolvedValue(TARGETS);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(calculateTargets).toHaveBeenCalledTimes(2);
    expect(generatePlan).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/We couldn't build your plan/)).toBeNull();
    expect(states()).toEqual(['current', 'pending', 'pending']);

    await advance(3150);
    expect(mockStep.next).toHaveBeenCalledWith({ targets: TARGETS, plan: PLAN });
    warn.mockRestore();
  });
});
