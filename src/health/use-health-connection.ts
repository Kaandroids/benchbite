import { useEffect, useState } from 'react';

import { setHealthConnected, setWeightSync, useHealthConnected } from './connection';
import {
  healthAvailability,
  healthStillAllowed,
  healthWeightAllowed,
  releaseHealthAccess,
  requestHealthAccess,
} from './health';

/** Why the last step did not connect or disconnect as asked. */
export type HealthProblem = 'denied' | 'unavailable' | 'failed' | 'releaseFailed';

/** The sheet that is open: before the system asks, to disconnect, or to get the store. */
export type HealthSheet = 'consent' | 'disconnect' | 'install' | null;

/**
 * Connecting the phone's health store and disconnecting it (#467, ADR 0097), with the sheets the
 * steps open and what went wrong. A connection the system has taken back since is let go.
 */
export function useHealthConnection() {
  const connected = useHealthConnected();
  const [sheet, setSheet] = useState<HealthSheet>(null);
  const [problem, setProblem] = useState<HealthProblem | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!connected) return;
    let current = true;
    healthStillAllowed()
      .then((allowed) => {
        if (current && !allowed) setHealthConnected(false);
      })
      .catch((error: unknown) => console.warn('Could not check the access to health data', error));
    return () => {
      current = false;
    };
  }, [connected]);

  /** Opens the next step: disconnecting, the consent sheet, or getting the store first. */
  const open = async () => {
    if (busy) return;
    setProblem(null);
    if (connected) {
      setSheet('disconnect');
      return;
    }
    try {
      const availability = await healthAvailability();
      if (availability === 'available') setSheet('consent');
      else if (availability === 'missing') setSheet('install');
      else setProblem('unavailable');
    } catch (error) {
      console.warn('Could not check the health store', error);
      setProblem('failed');
    }
  };

  /** Asks the system, once the user agreed, and keeps whether reading was allowed. */
  const connect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const allowed = await requestHealthAccess();
      setHealthConnected(allowed);
      // Weight is among what was asked for (ADR 0100); Android can allow the rest without it, and
      // Progress then asks for it alone.
      if (allowed) setWeightSync((await healthWeightAllowed()) ? 'on' : null);
      setProblem(allowed ? null : 'denied');
    } catch (error) {
      console.warn('Could not ask for the access to health data', error);
      setProblem('failed');
    } finally {
      setBusy(false);
      setSheet(null);
    }
  };

  /** Stops reading, and gives up the access where the system lets it; says so when it did not. */
  const disconnect = async () => {
    if (busy) return;
    setBusy(true);
    setHealthConnected(false);
    try {
      await releaseHealthAccess();
    } catch (error) {
      console.warn('Could not give up the access to health data', error);
      setProblem('releaseFailed');
    } finally {
      setBusy(false);
      setSheet(null);
    }
  };

  const close = () => {
    if (!busy) setSheet(null);
  };

  return { connected, sheet, problem, busy, open, connect, disconnect, close };
}
