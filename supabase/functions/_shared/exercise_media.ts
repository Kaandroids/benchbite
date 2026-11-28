// Where the exercises' videos are kept (ADR 0176), shared by the app that shows them and the script
// that uploads them, so that they agree. This file imports nothing, so that the app can bundle it.

/** The public bucket of the exercises' videos and posters, in "<exercise id>/". */
export const EXERCISE_MEDIA_BUCKET = 'exercise-media';
