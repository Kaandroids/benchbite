// Opening a workout or a log, which live in the Workout tab, from anywhere in the app.
import { router } from 'expo-router';

/**
 * The Workout tab's list goes beneath what is opened in it from elsewhere, as from Today, so that
 * back, and a log deleted there, return to the list instead of leaving the tab on that screen
 * (the tab's layout names the list its anchor). Opened from inside the tab it changes nothing.
 */
const WITH_LIST = { withAnchor: true };

/** Opens a workout of the plan. */
export function openWorkout(id: number) {
  router.push({ pathname: '/workout/[id]', params: { id: String(id) } }, WITH_LIST);
}

/** Opens a workout's log. */
export function openLog(id: number) {
  router.push({ pathname: '/workout/log/[id]', params: { id: String(id) } }, WITH_LIST);
}
