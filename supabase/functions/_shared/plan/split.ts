import type { Experience, SessionType } from './types.ts';

/**
 * The session types of a week, in order, for the number of training days. Beginners train the
 * whole body three times a week; with more experience, three days become push, pull and legs. A
 * week has at most three types, since each type becomes one workout (ADR 0019).
 */
export function splitFor(days: number, experience: Experience): SessionType[] {
  switch (days) {
    case 1:
      return ['full_body'];
    case 2:
      return ['full_body', 'full_body'];
    case 3:
      return experience === 'beginner'
        ? ['full_body', 'full_body', 'full_body']
        : ['push', 'pull', 'legs'];
    case 4:
      return ['upper', 'lower', 'upper', 'lower'];
    case 5:
      return ['upper', 'lower', 'full_body', 'upper', 'lower'];
    case 6:
      return ['push', 'pull', 'legs', 'push', 'pull', 'legs'];
    default:
      throw new RangeError(`A plan needs one to six training days, not ${days}`);
  }
}
