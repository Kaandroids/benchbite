import { useEffect, useState } from 'react';

/**
 * The current time, updated every second while `running`, for clocks that count. With `since`, the
 * updates fall just after whole seconds from it, so that a clock started then shows the time it has
 * run, as stopping it logs.
 */
export function useNow(running: boolean, since?: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) {
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = since === undefined ? 1000 : 1000 - ((Date.now() - since) % 1000) + 5;
      timer = setTimeout(() => {
        setNow(Date.now());
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [running, since]);
  return now;
}
