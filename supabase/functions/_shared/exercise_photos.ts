// Where the photos of custom exercises are kept, shared by the app that writes them and the function
// that removes them, so that they agree. This file imports nothing, so that the app can bundle it.

/** The private bucket of the photos users add to their own exercises, in "<user id>/". */
export const EXERCISE_PHOTOS_BUCKET = 'exercise-photos';
