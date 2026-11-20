// The backend refuses a build of the app that is no longer supported (ADR 0157): the Data API and
// the Edge Functions answer its requests with 426 Upgrade Required. Every response of the app's
// requests passes here, and what asks the server what this build has to hold to listens, so that
// a refusal puts the update screen in the app's place whichever request met it.

/** The status the backend refuses an unsupported build with. */
export const UPGRADE_REQUIRED = 426;

const listeners = new Set<() => void>();

/** Calls `listener` whenever the backend refuses this build; returns how to stop. */
export function onVersionRefused(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Passes a response on, telling the listeners when it refuses this build. */
export function noteResponse(response: Response): Response {
  if (response.status === UPGRADE_REQUIRED) {
    listeners.forEach((listener) => listener());
  }
  return response;
}
