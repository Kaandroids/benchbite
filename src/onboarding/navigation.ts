import { router } from 'expo-router';

import { stepHref, type Step } from './steps';

/**
 * Goes back to an earlier step, leaving none of the steps after it to go back to. Every step is
 * the same route, so going back to one by its address would only change the screen on top: the
 * steps are closed down to the first, which becomes the step.
 */
export function returnTo(step: Step) {
  if (router.canDismiss()) {
    router.dismissAll();
  }
  router.replace(stepHref(step));
}
