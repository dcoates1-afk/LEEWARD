import { useEffect, useRef, useState } from 'react';
import { aisSocketUrl } from '../lib/ais';
import type { AisSnapshotMessage, AisState, AisStatusMessage, AisVessel } from '../lib/ais';

export function useAis(enabled: boolean) {
  const [state, setState] = useState<AisState>('idle');
  const [vessels, setVessels] = useState<AisVessel[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const retry = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setState('idle');
      return;
    }

    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const open = () => {
      if (closed) return;
      setState((current) => (current === 'live' ? current : 'connecting'));
      try {
        socket = new WebSocket(aisSocketUrl());
      } catch {
        setState('error');
        setNote('Could not open the AIS relay socket.');
        return;
      }

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as AisStatusMessage | AisSnapshotMessage;
          if (message.type === 'status') {
            setState(message.state);
            setNote(message.note);
            return;
          }
          if (message.type === 'snapshot') {
            setState(message.state);
            setNote(message.note);
            setVessels(
              message.vessels.filter(
                (vessel) => Number.isFinite(vessel.lat) && Number.isFinite(vessel.lon),
              ),
            );
            retry.current = 0;
          }
        } catch {
          // Ignore malformed frames rather than tearing down the stream.
        }
      };

      socket.onclose = () => {
        if (closed) return;
        setState('reconnecting');
        retry.current = Math.min(retry.current + 1, 5);
        const delay = Math.min(15_000, 1000 * 2 ** retry.current);
        timer = setTimeout(open, delay);
      };

      socket.onerror = () => {
        // onclose follows and schedules the retry.
      };
    };

    open();

    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    };
  }, [enabled]);

  return { state, vessels, note };
}
