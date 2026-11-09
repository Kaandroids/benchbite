/**
 * The queries of other apps' workouts (ADR 0106), on their own so that anything that changes what
 * they show, as logging or deleting a workout, can refresh them without loading the rest.
 */
export const OUTSIDE_WORKOUTS_KEY = ['outside-workouts'];
