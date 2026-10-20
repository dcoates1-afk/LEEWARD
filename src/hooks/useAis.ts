import { useEffect, useRef, useState } from 'react';
import { aisSocketUrl } from '../lib/ais';
import type { AisScope, AisSnapshotMessage, AisState, AisStatusMessage, AisVessel } from '../lib/ais';
import {
  applyStaticInfo,
  readAisStaticCache,
  rememberVessels,
  writeAisStaticCache,
} from '../lib/aisStaticCache';
import type { AisStaticMap } from '../lib/aisStaticCache';

export type ChartBounds = [number, number, number, number];

/**
 * Streams AIS targets for the chart currently on screen. The relay subscribes
 * its shared AISStream upstream to the union of every client's view, so moving
 * the chart re-aims the feed instead of leaving a worldwide firehose running.
 */
export function useAis(enabled: boolean, bounds?: ChartBounds) {
  const [state, setState] = useState<AisState>('idle');
  const [vessels, setVessels] = useState<AisVessel[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [scope, setScope] = useState<AisScope | null>(null);
  const retry = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);
  const boundsRef = useRef<ChartBounds | undefined>(bounds);
  boundsRef.current = bounds;
  // Names and dimensions outlive a connection: a target that has just come
  // into range shows its name immediately instead of waiting for the next
  // static broadcast slot.
  const cacheRef = useRef<AisStaticMap | null>(null);
  if (cacheRef.current === null) {
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    cacheRef.current = readAisStaticCache(storage);
  }
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWrite = useRef(0);

  useEffect(() => {
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
      writeTimer.current = null;
    };
  }, []);

  const sendBounds = (socket: WebSocket | null = socketRef.current) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (!boundsRef.current) return;
    socket.send(JSON.stringify({ type: 'bounds', bounds: boundsRef.current }));
  };

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
      let ws: WebSocket;
      try {
        ws = new WebSocket(aisSocketUrl());
      } catch {
        setState('error');
        setNote('Could not open the AIS relay socket.');
        return;
      }
      socket = ws;
      socketRef.current = ws;

      ws.onopen = () => {
        retry.current = 0;
        sendBounds(ws);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as AisStatusMessage | AisSnapshotMessage;
          if (message.type === 'status') {
            setState(message.state);
            setNote(message.note);
            if (message.scope) setScope(message.scope);
            return;
          }
          if (message.type === 'snapshot') {
            setState(message.state);
            setNote(message.note);
            if (message.scope) setScope(message.scope);
            const positioned = message.vessels.filter(
              (vessel) => Number.isFinite(vessel.lat) && Number.isFinite(vessel.lon),
            );
            const cache = cacheRef.current ?? new Map();
            const merged = positioned.map((vessel) => applyStaticInfo(vessel, cache.get(vessel.mmsi)));
            setVessels(merged);
            const remembered = rememberVessels(cache, merged);
            if (remembered.changed) {
              cacheRef.current = remembered.cache;
              // Store the first names straight away, then at most every few
              // seconds: snapshots arrive every 2.5 s and a full cache rewrite
              // per snapshot would be wasted work.
              const flush = () => {
                let storage: Storage | null = null;
                try {
                  storage = window.localStorage;
                } catch {
                  storage = null;
                }
                writeAisStaticCache(storage, cacheRef.current ?? new Map());
                lastWrite.current = Date.now();
              };
              if (Date.now() - lastWrite.current > 4000) {
                flush();
              } else if (!writeTimer.current) {
                writeTimer.current = setTimeout(() => {
                  writeTimer.current = null;
                  flush();
                }, 4000);
              }
            }
            retry.current = 0;
          }
        } catch {
          // Ignore malformed frames rather than tearing down the stream.
        }
      };

      ws.onclose = () => {
        socketRef.current = null;
        if (closed) return;
        setState('reconnecting');
        retry.current = Math.min(retry.current + 1, 5);
        const delay = Math.min(15_000, 1000 * 2 ** retry.current);
        timer = setTimeout(open, delay);
      };

      ws.onerror = () => {
        // onclose follows and schedules the retry.
      };
    };

    open();

    return () => {
      closed = true;
      socketRef.current = null;
      if (timer) clearTimeout(timer);
      socket?.close();
    };
  }, [enabled]);

  // Re-aim the subscription after the chart settles, not on every pan tick.
  useEffect(() => {
    const timer = setTimeout(() => sendBounds(), 900);
    return () => clearTimeout(timer);
    // Intentionally keyed on the four edges: a new array with the same view
    // should not re-aim the subscription.
  }, [bounds?.[0], bounds?.[1], bounds?.[2], bounds?.[3]]);

  return { state, vessels, note, scope };
}
