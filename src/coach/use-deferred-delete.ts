import { useEffect, useRef, useState } from 'react';

/**
 * Deleting with Undo (ADR 0055): an item goes from the screen at once and is deleted when its Undo
 * has gone, when another is deleted, or when the screen closes, unless it was undone.
 */
export function useDeferredDelete<Item extends { id: number }>(commit: (id: number) => void) {
  // The item waiting, which a commit takes; null once undone or committed.
  const waiting = useRef<Item | null>(null);
  const [deleting, setDeleting] = useState<Item | null>(null);
  const latestCommit = useRef(commit);
  useEffect(() => {
    latestCommit.current = commit;
  }, [commit]);

  const flush = () => {
    if (waiting.current) latestCommit.current(waiting.current.id);
    waiting.current = null;
  };

  // Leaving the screen does not undo a delete.
  useEffect(
    () => () => {
      if (waiting.current) latestCommit.current(waiting.current.id);
    },
    [],
  );

  return {
    /** The item being deleted, while its Undo shows. */
    deleting,
    /** Takes `item` away, to be deleted; one waiting before goes through first. */
    remove: (item: Item) => {
      flush();
      waiting.current = item;
      setDeleting(item);
    },
    /** Keeps the item being deleted. */
    undo: () => {
      waiting.current = null;
    },
    /** Its Undo has gone: deletes the item unless it was undone. */
    settle: () => {
      flush();
      setDeleting(null);
    },
  };
}
