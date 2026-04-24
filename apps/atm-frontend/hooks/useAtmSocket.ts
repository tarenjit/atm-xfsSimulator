'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { AtmSession } from '@/types/atm';

export interface AtmEventFrame {
  hService: string;
  serviceClass: string;
  eventCode: string;
  eventClass: string;
  payload: unknown;
  timestamp: string;
}

/**
 * Subscribes to the xfs-server websocket for:
 *   - atm.stateChanged      → session state
 *   - atm.sessionEnded      → session wrap-up
 *   - xfs.event             → device events (informational)
 *
 * Returns live session + last 100 events.
 */
export function useAtmSocket(url = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001') {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [session, setSession] = useState<AtmSession | null>(null);
  const [events, setEvents] = useState<AtmEventFrame[]>([]);

  useEffect(() => {
    const socket = io(`${url}/xfs`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on(
      'atm.stateChanged',
      (frame: { session: AtmSession; previousState: string }) => {
        setSession(frame.session);
      },
    );
    socket.on('atm.sessionEnded', () => {
      setSession(null);
    });
    socket.on('xfs.event', (ev: AtmEventFrame) => {
      setEvents((prev) => [ev, ...prev].slice(0, 100));
    });

    return () => {
      socket.close();
    };
  }, [url]);

  return { connected, session, events, socket: socketRef.current };
}
