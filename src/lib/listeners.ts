/** Listeners to a value kept outside React: `subscribe` for `useSyncExternalStore`, `notify` on a change. */
export function createListeners() {
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    notify: () => {
      for (const listener of listeners) {
        listener();
      }
    },
  };
}
