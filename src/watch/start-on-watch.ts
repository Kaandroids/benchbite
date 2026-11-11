// Whether a workout started on the phone starts on the watch too (ADR 0115): asked at each start,
// always, or never, as the user chose in the settings, and only with a watch to start it on. The
// choice belongs to the device, as the watch does.
import { createQuestion } from '@/components/ui/question';
import { createDeviceChoice } from '@/lib/device-storage';

import { hasWatch } from './types';
import { readWatchStatus } from './watch-status';

export const START_ON_WATCH_CHOICES = ['ask', 'always', 'never'] as const;
export type StartOnWatchChoice = (typeof START_ON_WATCH_CHOICES)[number];

const startOnWatch = createDeviceChoice('watch.startOnWatch', START_ON_WATCH_CHOICES, 'ask');

export const loadStartOnWatch = startOnWatch.load;
export const setStartOnWatch = startOnWatch.set;
export const useStartOnWatch = startOnWatch.useChoice;

/** The answer to "Start on your Apple Watch too?": on the watch or only on the phone, and kept. */
export type StartOnWatchAnswer = { onWatch: boolean; keep: boolean };

/** The question, answered with null when it is closed or left open: the workout does not start. */
const watchQuestion = createQuestion<void, StartOnWatchAnswer | null>(null);

/** The question shown in `StartOnWatchSheet`, with its answer; none when none is. */
export const useStartOnWatchQuestion = watchQuestion.useQuestion;

/**
 * Whether a workout about to start starts on the watch too: never without a watch; else as the
 * user chose, asking when they chose to be asked, and keeping an answer they ask not to be asked
 * again. Null when it is not to start, as the question was closed.
 */
export async function startsOnWatch(): Promise<boolean | null> {
  if (!hasWatch(await readWatchStatus())) return false;
  const choice = loadStartOnWatch();
  if (choice !== 'ask') return choice === 'always';
  const answer = await watchQuestion.ask();
  if (!answer) return null;
  if (answer.keep) setStartOnWatch(answer.onWatch ? 'always' : 'never');
  return answer.onWatch;
}
